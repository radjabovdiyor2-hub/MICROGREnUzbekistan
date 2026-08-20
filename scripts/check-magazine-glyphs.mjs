// ════════════════════════════════════════════════════════════
// Символы номера против подмножества шрифта.
//   node scripts/check-magazine-glyphs.mjs [файл.html ...]
//
// ЗАЧЕМ
// content/templates/fonts/fonts-subset.css — не полный шрифт, а подмножество,
// и у каждого начертания объявлен `unicode-range`. Это не подсказка, а ворота:
// символ вне диапазона браузер даже не пытается взять из встроенного файла, он
// молча уходит в системную подмену ('Helvetica Neue', Arial). На экране Windows
// это заметно только по метрикам, а в тираже — либо чужой шрифт в середине
// строки, либо пустой квадрат, если на машине сборки такого символа нет вовсе.
//
// Опаснее всего это для научной вёрстки: стрелка реакции, знак градуса,
// подстрочный индекс формулы и греческие буквы — всё вне диапазона. Отсюда
// правило номера: химию рисуем геометрией (линия + стрелка полигоном), индекс
// делаем отдельным <text> со сдвигом dy, а не символом U+2082.
//
// Проверяется то, что видит читатель: текстовые узлы, alt и aria-label.
// Комментарии, CSS и разметка — нет: они в макет не попадают.
//
// Выход 1 при любом символе вне диапазона и вне списка исключений.
// ════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONTS = 'content/templates/fonts/fonts-subset.css';

const TARGETS = [
  'content/generated/shakar-01-print.html',
  'apps/web/public/magazine/shakar-01.html',
];

// Уже в номере и печатается подменой. Это долг, а не норма: знак градуса
// встречается на температурной шкале, минус — в скидках подписки. Внесены,
// чтобы сторож ловил НОВЫЕ нарушения, а не молчал под грузом старых.
// Убрать отсюда можно двумя путями: нарисовать (кружок вместо °, чёрточка
// вместо −) или пересобрать подмножество шрифта отдельным коммитом.
const ALLOW = new Map([
  [0x00b0, 'знак градуса на температурной шкале — 9 вхождений на момент заведения сторожа'],
  [0x2212, 'типографский минус в скидках подписки — 3 вхождения'],
]);

/** Разбирает `unicode-range: U+21-5b, U+7c, U+2013-2014` в список отрезков. */
function parseRanges(css) {
  const out = [];
  for (const decl of css.matchAll(/unicode-range:\s*([^;}]+)/gi)) {
    for (const part of decl[1].split(',')) {
      const m = part.trim().match(/^U\+([0-9a-f]+)(?:-([0-9a-f]+))?$/i);
      if (!m) continue;
      const from = parseInt(m[1], 16);
      out.push([from, m[2] ? parseInt(m[2], 16) : from]);
    }
  }
  return out;
}

/** Текст, который увидит читатель: узлы, alt и aria-label. Разметка — мимо. */
function visibleText(html) {
  const lines = html.split(/\r?\n/);
  // <style> и комментарии в макет не попадают: вырезаем построчно, сохраняя
  // нумерацию строк — без неё сообщение об ошибке бесполезно.
  //
  // Оба вида блоков МНОГОСТРОЧНЫЕ: шапка номера — комментарий на два десятка
  // строк, стили — на сотню. Однострочной регуляркой их не снять, нужен флаг
  // состояния между строками, иначе сторож ругается на «§6.2» из собственного
  // заголовка файла — текста, которого читатель не видит.
  let inStyle = false;
  let inComment = false;
  return lines.map((raw) => {
    let line = raw;
    if (inComment) {
      const end = line.indexOf('-->');
      if (end === -1) return '';
      line = line.slice(end + 3);
      inComment = false;
    }
    line = line.replace(/<!--.*?-->/g, '');
    const openComment = line.indexOf('<!--');
    if (openComment !== -1) {
      inComment = true;
      line = line.slice(0, openComment);
    }
    if (inStyle) {
      const end = line.indexOf('</style>');
      if (end === -1) return '';
      line = line.slice(end);
      inStyle = false;
    }
    const start = line.indexOf('<style');
    if (start !== -1) {
      inStyle = true;
      line = line.slice(0, start);
    }
    const attrs = [...line.matchAll(/\b(?:alt|aria-label)="([^"]*)"/gi)].map((m) => m[1]);
    const nodes = line.replace(/<[^>]*>/g, '').split('');
    return decode([...nodes, ...attrs].join(' '));
  });
}

function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

const ranges = parseRanges(await readFile(join(ROOT, FONTS), 'utf8'));
if (!ranges.length) {
  console.error(`✗ в ${FONTS} не найдено ни одного unicode-range — сторож ослеп`);
  process.exit(1);
}
const covered = (cp) => ranges.some(([a, b]) => cp >= a && cp <= b);

let hits = 0;
let allowed = 0;
const targets = process.argv.length > 2 ? process.argv.slice(2) : TARGETS;

for (const rel of targets) {
  let html;
  try {
    html = await readFile(join(ROOT, rel), 'utf8');
  } catch {
    continue;
  }
  const found = new Map();
  visibleText(html).forEach((line, i) => {
    for (const ch of line) {
      const cp = ch.codePointAt(0);
      // Служебные пробелы и перевод строки в подмножество не входят и не должны.
      if (cp <= 0x20 || covered(cp)) continue;
      if (ALLOW.has(cp)) {
        allowed += 1;
        continue;
      }
      const key = `${cp}`;
      if (!found.has(key)) found.set(key, { ch, line: i + 1, count: 0 });
      found.get(key).count += 1;
    }
  });

  for (const { ch, line, count } of found.values()) {
    hits += 1;
    const hex = ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
    console.error(`✗ ${relative('.', rel)}:${line}  «${ch}» U+${hex} — вне подмножества, ${count} вхожд.`);
  }
}

if (hits) {
  console.error(`\n✗ символов вне подмножества: ${hits}.`);
  console.error('  Такой символ печатается чужим шрифтом или пустым квадратом.');
  console.error('  Химию рисуем геометрией: стрелка — линия с полигоном, индекс — <text> со сдвигом dy.');
  console.error(`  Диапазон объявлен в ${FONTS}.`);
  process.exit(1);
}

console.log(`✓ символы номера умещаются в подмножество шрифта (терпимых исключений: ${allowed}).`);

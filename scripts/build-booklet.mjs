// ════════════════════════════════════════════════════════════
// Спуск полос: из мастер-макета делает брошюру под домашнюю печать
// на A4 с одним сгибом посередине (сшивка скрепкой в корешок).
//
//   node booklet.mjs
//   вход:  content/generated/jasmin-print.html   (154×216, с вылетами)
//   выход: content/generated/jasmin-a4-booklet.html (A4 landscape ×6)
//
// Почему отдельный файл, а не правка мастера: в мастере формат
// 154×216 мм — это чистый A5 плюс 3 мм вылета с каждой стороны, как
// требует типография. Два таких листа рядом дают 308 мм, в A4 (297)
// они не влезают. Для домашней печати вылет не нужен и невозможен:
// принтер всё равно не печатает в край. Поэтому здесь каждая полоса
// обрезается по линии реза до 148×210 — ровно то, что сделал бы нож —
// и два чистых A5 встают в A4 (296 из 297 мм).
//
// Мастер остаётся нетронутым: его отдавать в типографию.
// ════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'content', 'generated', 'jasmin-print.html');
const OUT = join(ROOT, 'content', 'generated', 'jasmin-a4-booklet.html');

const html = (await readFile(SRC, 'utf8')).replace(/\r\n/g, '\n');

// ── разбираем мастер на голову и полосы ──
const head = html.slice(html.indexOf('<style>'), html.indexOf('</style>') + '</style>'.length);
const body = html.slice(html.indexOf('<div class="mag-doc">'));

/**
 * Вырезает полосу целиком, считая глубину вложенности div.
 * По последнему </div> нельзя: у двенадцатой полосы за ней закрывается
 * ещё и обёртка .mag-doc, и в кусок попадал лишний закрывающий тег —
 * вторая полоса листа потом оказывалась вложенной в первую.
 */
function extractPage(src, from) {
  const open = src.indexOf('<div class="mag-page', from);
  if (open < 0) return null;
  const re = /<div\b[^>]*>|<\/div>/g;
  re.lastIndex = open;
  let depth = 0, m;
  while ((m = re.exec(src))) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) return { html: src.slice(open, re.lastIndex), end: re.lastIndex };
  }
  throw new Error('незакрытый <div class="mag-page">');
}

const parts = [];
for (let pos = 0; ; ) {
  const got = extractPage(body, pos);
  if (!got) break;
  parts.push(got.html);
  pos = got.end;
}
if (parts.length !== 12) throw new Error(`ожидалось 12 полос, найдено ${parts.length}`);

const pages = parts.map((p, i) => {
  let s = p;
  // Направляющие реза не нужны: мы уже режем по ним
  s = s.replace(/\s*<div class="trim-guide"><\/div>/g, '');
  // Внешнее/внутреннее поле у корешка задавалось через :nth-child по
  // порядку в документе. После спуска порядок другой, поэтому сторону
  // фиксируем классом: нечётные полосы правые (recto), чётные — левые.
  s = s.replace('class="mag-page', `class="mag-page ${(i + 1) % 2 ? 'recto' : 'verso'}`);
  return s;
});

// ── спуск: для N полос лист k несёт (N−2k+2 | 2k−1) на лице
//    и (2k | N−2k+1) на обороте ──
const N = pages.length;
const sheets = [];
for (let k = 1; k <= N / 4; k++) {
  sheets.push({ side: 'лицо', n: 2 * k - 1, l: N - 2 * k + 2, r: 2 * k - 1 });
  sheets.push({ side: 'оборот', n: 2 * k, l: 2 * k, r: N - 2 * k + 1 });
}

const slot = (num) => `      <div class="slot"><span class="slot-num screen-only">${num}</span>
${pages[num - 1].split('\n').map((l) => '        ' + l).join('\n')}
      </div>`;

const sheetHtml = sheets.map((s) => `    <div class="sheet">
      <div class="sheet-label screen-only">Лист ${Math.ceil(s.n / 2)} · ${s.side} · полосы ${s.l} и ${s.r}</div>
      <div class="fold screen-only"></div>
${slot(s.l)}
${slot(s.r)}
    </div>`).join('\n\n');

const css = `
<style>
/* ════════════════════════════════════════════════════════════
   РАСКЛАДКА ПОД A4 С ОДНИМ СГИБОМ

   Лист: A4 landscape 297×210 мм. На нём два чистых A5 (148×210)
   встык, сгиб ровно по центру — 148.5 мм. Полоса из мастера имеет
   154×216 (вылет 3 мм), поэтому она сдвинута на −3/−3 внутрь окна
   148×210 с overflow:hidden: это и есть обрез по линии реза.

   ПЕЧАТЬ
   1. Двусторонняя, переворот по КОРОТКОЙ стороне.
      Проверка на первом листе: за полосой 1 должна оказаться 2.
      Если оказалась 11 — поменяйте переворот на длинную сторону.
   2. Масштаб 100 %, «по размеру страницы» выключить.
   3. Фоновая графика включена.
   4. Сложить пополам все три листа вместе, скрепка в сгиб.

   Если принтер срезает по краям больше, чем хочется (в край он
   печатать не умеет), поставьте --shrink: 0.96 — полосы уменьшатся
   и целиком уйдут в печатаемую область, сгиб останется по центру.
   ════════════════════════════════════════════════════════════ */

:root { --shrink: 1; }

@page { size: A4 landscape; margin: 0; }

html, body {
  background: #17191c;
  margin: 0;
  padding: 0;
  display: block;
  width: auto;
}

.booklet { display: flex; flex-direction: column; align-items: center; gap: 28px; padding: 28px 0; }

.sheet {
  width: 297mm;
  height: 210mm;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  background: #fff;
  overflow: hidden;
  page-break-after: always;
  break-after: page;
  box-shadow: 0 14px 40px rgba(0, 0, 0, .55);
}
.sheet:last-child { page-break-after: auto; break-after: auto; }

/* Окно чистого формата: всё, что было вылетом, уходит под нож */
.slot {
  width: calc(148mm * var(--shrink));
  height: calc(210mm * var(--shrink));
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
}
.slot > .mag-page {
  position: absolute;
  left: -3mm;
  top: -3mm;
  margin: 0 !important;
  box-shadow: none !important;
  page-break-after: auto !important;
  break-after: auto !important;
  transform: scale(var(--shrink));
  transform-origin: 3mm 3mm;
}

/* Сторона у корешка. В мастере поле задавалось через :nth-child по
   порядку в документе — после спуска порядок другой, поэтому внутри
   окна правило гасим и берём сторону из класса.
   Вес селекторов тут важен: сброс должен быть слабее правил recto/verso,
   иначе он их перекрывает и поле у корешка молча исчезает.
   .slot .mag-page .page-inner        → 3 класса
   .slot .mag-page.recto .page-inner  → 4 класса, побеждает */
.slot .mag-page .page-inner { padding-left: 0; padding-right: 0; }
.slot .mag-page.recto .page-inner { padding-left: var(--gutter-extra); }
.slot .mag-page.verso .page-inner { padding-right: var(--gutter-extra); }

/* Экранные подсказки — в печать не идут */
.sheet-label {
  position: absolute;
  top: -20px;
  left: 0;
  font: 600 11px/1 'Inter', sans-serif;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: #8b9199;
}
.fold {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  border-left: 1px dashed rgba(0, 0, 0, .32);
  z-index: 950;
}
.howto {
  width: 297mm;
  box-sizing: border-box;
  background: #fff;
  border-left: 3mm solid #0f3d2e;
  padding: 5mm 6mm;
  font: 400 12px/1.6 'Inter', sans-serif;
  color: #2a2f34;
}
.howto b { color: #0f3d2e; }
.slot-num {
  position: absolute;
  top: 4px;
  right: 6px;
  z-index: 960;
  font: 700 10px/1 'Inter', sans-serif;
  color: #b04a4a;
  background: rgba(255, 255, 255, .82);
  padding: 2px 4px;
}

@media print {
  /* Мастер в @media print прижимает body к 154 мм — здесь нужен лист A4 */
  html, body {
    background: none !important;
    width: 297mm !important;
    padding: 0 !important;
    gap: 0 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .booklet { display: block; padding: 0 !important; gap: 0 !important; }
  .sheet {
    box-shadow: none !important;
    page-break-after: always !important;
    break-after: page !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }
  .sheet:last-child { page-break-after: auto !important; break-after: auto !important; }
  /* Полосы внутри листа не должны сами просить перевод страницы */
  .slot > .mag-page {
    page-break-after: auto !important;
    break-after: auto !important;
    page-break-inside: avoid !important;
  }
  .screen-only, .trim-guide { display: none !important; }
}
</style>`;

// Памятка по печати — на экране, а не в комментарии: в CSS её никто
// не откроет, а ошибиться переворотом стоит трёх листов бумаги.
const howto = `  <div class="howto screen-only">
    <b>Печать: A4, двусторонняя, переворот по КОРОТКОЙ стороне.</b>
    Масштаб 100 % (не «по размеру страницы»), фоновая графика включена.
    <br>Проверка на первом листе: за полосой 1 должна оказаться полоса 2.
    Если оказалась 11 — переключите переворот на длинную сторону.
    <br>Три листа сложить вместе пополам, скрепка в сгиб. Эта подсказка не печатается.
  </div>`;

const out = `<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="UTF-8">
<title>FRESH WEEKLY №1 — Jasmin · раскладка A4 (сгиб посередине)</title>
<!--
  Брошюрная раскладка номера под домашнюю печать: A4 landscape, по два
  чистых A5 на лист, сгиб посередине, скрепка в корешок.

  Собрано из content/generated/jasmin-print.html — там мастер для
  типографии (154×216 с вылетами), его и надо отдавать в печать.
  Здесь вылеты обрезаны по линии реза: домашний принтер в край не
  печатает, а два листа 154 мм в A4 не помещаются.

  Спуск полос (12 страниц, сшивка в середине):
    лист 1  лицо 12|1   оборот 2|11
    лист 2  лицо 10|3   оборот 4|9
    лист 3  лицо  8|5   оборот 6|7   ← внутренний разворот
-->
${head}
${css}
</head>
<body>
<div class="booklet">
${howto}

${sheetHtml}
</div>
</body>
</html>
`;

await writeFile(OUT, out.replace(/\n/g, '\r\n'), 'utf8');
console.log(`✓ ${OUT}`);
console.log(`  листов A4: ${sheets.length} (${sheets.length / 2} × 2 стороны)`);
console.log(`  размер: ${(out.length / 1024 / 1024).toFixed(2)} МБ`);
for (const s of sheets) console.log(`   лист ${Math.ceil(s.n / 2)} ${s.side.padEnd(6)} → ${String(s.l).padStart(2)} | ${s.r}`);

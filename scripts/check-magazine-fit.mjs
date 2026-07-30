// ════════════════════════════════════════════════════════════
// Контроль вместимости полос печатного номера.
//   node scripts/check-magazine-fit.mjs [файл.html]
//
// Зачем: у .page-body высота фиксирована и стоит overflow:hidden —
// лишний контент не ломает вёрстку заметно, он молча уходит под обрез.
// На экране полоса выглядит целой, а в PDF пропадает последний блок.
//
// ПОЧЕМУ МЕТОДИКА ПОМЕНЯЛАСЬ
// Прошлая версия суммировала scrollHeight прямых детей .page-body и
// сравнивала сумму с высотой бокса. Это давало ложное «всё вмещается»:
// .page-body — flex-колонка, она ужимает детей, их scrollHeight
// подстраивается под сжатую высоту, и сумма всегда сходится. На полосе 9
// контент реально уходил под обрез, а скрипт был зелёный.
//
// Теперь меряем факт: положение низа последнего блока против двух границ.
//   ОБРЕЗ — низ самого .page-body: дальше overflow:hidden режет.
//   ПОЛЕ  — низ минус padding-bottom: нижнее безопасное поле, за ним
//           контент лезет на колонцифру и подходит к линии реза.
// Первое — ошибка, второе — предупреждение.
// ════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const file = resolve(process.argv[2] ?? 'content/generated/jasmin-print.html');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
// Без этого мерим по системной подмене шрифтов, а она уже другой ширины
await page.evaluate(() => document.fonts.ready);

const rows = await page.evaluate(() => {
  const toMm = (px) => +(px / (96 / 25.4)).toFixed(1);
  return [...document.querySelectorAll('.mag-page')].map((p, i) => {
    const body = p.querySelector('.page-body');
    if (!body) return { 'полоса': i + 1, 'до поля, мм': '—', 'до обреза, мм': '—', 'заметка': 'обложка' };

    const box = body.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(body).paddingBottom) || 0;
    const last = body.lastElementChild?.getBoundingClientRect();
    if (!last) return { 'полоса': i + 1, 'до поля, мм': '—', 'до обреза, мм': '—', 'заметка': 'пусто' };

    const toTrim = box.bottom - last.bottom;          // до нижней кромки .page-body
    const toSafe = toTrim - pad;                       // до нижнего безопасного поля
    return {
      'полоса': i + 1,
      'до поля, мм': toMm(toSafe),
      'до обреза, мм': toMm(toTrim),
      'заметка': toTrim < 0 ? 'РЕЖЕТ' : (toSafe < 0 ? 'в поле' : ''),
    };
  });
});

console.table(rows);
await browser.close();

const cut = rows.filter((r) => r['заметка'] === 'РЕЖЕТ');
const tight = rows.filter((r) => r['заметка'] === 'в поле');

if (tight.length) {
  console.warn(`⚠ заходит в нижнее поле (колонцифра рядом): полосы ${tight.map((r) => r['полоса']).join(', ')}`);
}
if (cut.length) {
  console.error(`\n✗ контент обрезан: полосы ${cut.map((r) => r['полоса']).join(', ')}`);
  process.exit(1);
}
console.log(tight.length ? '\n✓ ничего не обрезано' : '\n✓ все полосы держат нижнее поле');

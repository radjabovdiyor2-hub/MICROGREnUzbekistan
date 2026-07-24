// ════════════════════════════════════════════════════════════
// PDF печатного номера из собранного HTML.
//   node scripts/magazine-pdf.mjs [content/generated/<slug>-print.html]
//
// Заменяет ручные шаги «открыть в Chrome → Ctrl+P»: размер полосы, поля и
// фоновую графику там легко выставить неверно, а ошибка вылезет уже в тираже.
// Размер берётся из @page самого файла (154×216 мм = A5 + вылет 3 мм).
// ════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { stat } from 'node:fs/promises';

const src = resolve(process.argv[2] ?? 'content/generated/jasmin-print.html');
const out = src.replace(/\.html$/, '.pdf');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(src).href, { waitUntil: 'load' });
// Шрифты встроены base64, но раскладка считается уже после их применения
await page.evaluate(() => document.fonts.ready);

await page.pdf({
  path: out,
  preferCSSPageSize: true,   // @page { size: 154mm 216mm } из шаблона
  printBackground: true,     // плашки, тёмная задняя обложка, фон карточек
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
});
await browser.close();

const { size } = await stat(out);
console.log(`✓ ${out}`);
console.log(`  ${(size / 1024 / 1024).toFixed(1)} МБ · полоса 154×216 мм (A5 + вылет 3 мм)`);

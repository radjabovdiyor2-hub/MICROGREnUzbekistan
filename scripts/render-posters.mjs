// ════════════════════════════════════════════════════════════
// Рекламные постеры кампании: HTML → PNG точного размера и PDF под печать.
//   node scripts/render-posters.mjs [--out=<папка>]
//
// ПОЧЕМУ СКРИНШОТ ЭЛЕМЕНТА, А НЕ VIEWPORT
// Размер макета живёт в CSS (.p-4x5 = 1080×1350, .p-9x16 = 1080×1920).
// Снимая элемент, а не окно, мы не дублируем эти числа в скрипте: правка
// одного класса меняет и вёрстку, и выгрузку. deviceScaleFactor = 1,
// потому что размер уже задан в целевых пикселях — удвоение дало бы
// 2160×2700 и Instagram пережал бы кадр повторно.
//
// Имя файла берётся из data-name макета: порядок блоков в HTML менять
// можно, ссылки в captions.md от этого не поедут.
//
// Печатные листы (.sheet) уходят в PDF через page.pdf(): размер берётся
// из @page самого файла, как в scripts/magazine-pdf.mjs.
// ════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve, join, basename } from 'node:path';
import { mkdir, stat } from 'node:fs/promises';

const outFlag = process.argv.find((a) => a.startsWith('--out='));
const OUT = resolve(outFlag ? outFlag.slice('--out='.length) : 'content/posters/out');

const SCREENS = [
  'content/posters/social-4x5.html',
  'content/posters/stories-9x16.html',
];
const PRINTS = [
  'content/posters/print-a3-usul.html',
  'content/posters/print-a4-balans.html',
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1 });

let made = 0;

for (const src of SCREENS) {
  const file = resolve(src);
  try {
    await stat(file);
  } catch {
    console.error(`· пропущен, файла нет: ${src}`);
    continue;
  }
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  // Шрифты вшиты base64, но раскладка считается после их применения
  await page.evaluate(() => document.fonts.ready);

  const posters = await page.$$('.poster');
  for (const el of posters) {
    const name = (await el.getAttribute('data-name')) || `poster-${made}`;
    const path = join(OUT, `${name}.png`);
    await el.screenshot({ path });
    const box = await el.boundingBox();
    console.log(`✓ ${name}.png · ${Math.round(box.width)}×${Math.round(box.height)}`);
    made += 1;
  }
}

for (const src of PRINTS) {
  const file = resolve(src);
  try {
    await stat(file);
  } catch {
    console.error(`· пропущен, файла нет: ${src}`);
    continue;
  }
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);

  const path = join(OUT, basename(src).replace(/\.html$/, '.pdf'));
  await page.pdf({
    path,
    preferCSSPageSize: true,   // @page из самого файла: A3 или A4
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  const { size } = await stat(path);
  console.log(`✓ ${basename(path)} · ${(size / 1024 / 1024).toFixed(1)} МБ`);
  made += 1;

  // PNG-пруф печатного листа рядом с PDF: открыть PDF картинкой можно не на
  // всякой машине, а вёрстку надо посмотреть до типографии.
  const sheet = await page.$('.sheet');
  if (sheet) {
    const proof = path.replace(/\.pdf$/, '.proof.png');
    await sheet.screenshot({ path: proof });
    console.log(`  · пруф ${basename(proof)}`);
  }
}

await browser.close();

if (!made) {
  console.error('✗ не собрано ни одного макета');
  process.exit(1);
}
console.log(`\n✓ ${made} макетов в ${OUT}`);

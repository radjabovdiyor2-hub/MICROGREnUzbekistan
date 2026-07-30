// ════════════════════════════════════════════════════════════
// Сверка QR-кодов номера с конфигом.
//   node scripts/check-magazine-qr.mjs [конфиг.json]
//
// Зачем: подмена QR не видна глазом. Код выглядит правильно, печатается
// правильно и ведёт не туда. Два случая уже были:
//   · в номер попали два кода на несуществующий /m/jasmin — из хардкода
//     схемы в build-magazine.mjs;
//   · сторонний скрипт «исправил» по этой же схеме и правильные шесть
//     кодов блюд, попутно снеся жадной регуляркой полосы 6–7;
//   · мой собственный проход «заменить оставшиеся svg по размеру матрицы»
//     превратил все шесть кодов блюд в код рецепта: адрес блюда и адрес
//     рецепта дают одинаковую матрицу 41×41, различить их постфактум нечем.
//
// Все три ошибки ловятся одним способом: сгенерировать эталон из конфига
// и сравнить с тем, что лежит в номере. Декодер не нужен — QR
// детерминирован, эталон совпадает побайтово.
//
// Это НЕ заменяет проверку сканированием с распечатки (чеклист в
// docs/magazine-print-spec.md): здесь сверяется, что в файле те коды,
// что задумано, но не то, что страница по адресу существует.
// ════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TPL = join(ROOT, 'content', 'templates');
const OUT = join(ROOT, 'content', 'generated');

const cfgPath = process.argv[2] ? resolve(process.argv[2]) : join(TPL, 'jasmin.json');
const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
const expect = JSON.parse(await readFile(join(TPL, `${cfg.slug}-qr.json`), 'utf8'));
const urls = JSON.parse(await readFile(join(TPL, `${cfg.slug}-qr.urls.json`), 'utf8'));

// Сколько раз каждый код стоит в номере
const TIMES = { MENU: 2, RECIPE: 1, BOT: 1, D1: 1, D2: 1, D3: 1, D4: 1, D5: 1, D6: 1 };
const TOTAL = Object.values(TIMES).reduce((a, b) => a + b, 0);

const files = [`${cfg.slug}-print.html`, `${cfg.slug}-a4-booklet.html`];
let bad = 0;

for (const name of files) {
  let html;
  try { html = (await readFile(join(OUT, name), 'utf8')).replace(/\r\n/g, '\n'); }
  catch { console.log(`\n— ${name}: нет файла, пропускаю`); continue; }

  const found = (html.match(/<svg xmlns/g) || []).length;
  const raster = (html.match(/<div class="menu-qr[^>]*>\s*<img/g) || []).length;
  console.log(`\n== ${name}`);

  for (const [key, svg] of Object.entries(expect)) {
    const times = html.split(svg).length - 1;
    const need = TIMES[key] ?? 1;
    const ok = times === need;
    if (!ok) bad++;
    console.log(`  ${ok ? 'ok ' : 'НЕТ'} ${key.padEnd(7)} ${times}/${need}×  ${urls[key]}`);
  }

  if (found !== TOTAL) { console.log(`  НЕТ всего векторных кодов ${found}, ожидалось ${TOTAL}`); bad++; }
  if (raster) { console.log(`  НЕТ растровых кодов ${raster}, ожидалось 0 (растр мылит на 300 dpi)`); bad++; }
}

if (bad) {
  console.error(`\n✗ QR расходятся с конфигом (${bad}). Пересобрать: node scripts/build-magazine-qr.mjs && node scripts/apply-magazine-design.mjs && node scripts/build-booklet.mjs`);
  process.exit(1);
}
console.log('\n✓ все QR совпадают с конфигом');

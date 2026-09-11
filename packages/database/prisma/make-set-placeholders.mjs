/**
 * Заглушки под снимки наборов.
 *
 * ЗАЧЕМ ОНИ НУЖНЫ. Слаг товара строится из имени файла картинки
 * (`import-catalog.ts::slugOf`), поэтому у каждой строки прайса обязан быть
 * СВОЙ файл. Пока настоящих снимков нет, без заглушек в печатном прайсе и на
 * витрине было бы двадцать битых картинок.
 *
 * ЭТО НЕ ФОТО ЕДЫ И НЕ ПРИТВОРЯЕТСЯ ИМ. Однотонная мятная плитка с кодом
 * набора и словами «фото готовится» — честная пустая рамка. Съел бы её
 * покупатель за снимок продукта — было бы враньё; так — видно, что фото ещё
 * нет.
 *
 * КАК ЗАМЕНИТЬ. Положите настоящий снимок в apps/web/public/catalog/ под тем
 * же именем — и всё. Ни строки кода менять не нужно: следующая выкатка
 * подхватит файл, а `seed-recipe-sets.ts` проставит его же карточке набора.
 *
 * Запуск:  node packages/database/prisma/make-set-placeholders.mjs
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT = join(ROOT, 'apps', 'web', 'public', 'catalog');

/** Фирменные цвета — из shared/brand.py, а не подобранные на глаз. */
const MINT = '#D1FAE5';
const EMERALD = '#0E6B47';
const MUTED = '#6E8C7C';

/** Код набора → имя файла. Порядок тот же, что в прайсе. */
const SETS = [
  ['BL-1', 'set_bl1_tanishuv'],
  ['BL-2', 'set_bl2_hafta'],
  ['BL-3', 'set_bl3_qadam'],
  ['BL-4', 'set_bl4_toyimli'],
  ['KN-1', 'set_kn1_boul'],
  ['KN-2', 'set_kn2_nonushta'],
  ['KN-3', 'set_kn3_tamlar'],
  ['KN-4', 'set_kn4_keyl'],
  ['FA-1', 'set_fa1_faol'],
  ['FA-2', 'set_fa2_zal'],
  ['OS-1', 'set_os1_pasta'],
  ['OS-2', 'set_os2_tova'],
  ['OS-3', 'set_os3_palov'],
  ['OS-4', 'set_os4_samarqand'],
  ['CH-1', 'set_ch1_palitra'],
  ['CH-2', 'set_ch2_achchiq'],
  ['CH-3', 'set_ch3_barg'],
  ['CH-4', 'set_ch4_hid'],
  ['MH-1', 'set_mh1_laganda'],
  ['IS-1', 'set_is1_ofis'],
];

const SIZE = 1500;

function tile(code) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
    <rect width="${SIZE}" height="${SIZE}" fill="${MINT}"/>
    <rect x="60" y="60" width="${SIZE - 120}" height="${SIZE - 120}" fill="none"
          stroke="${EMERALD}" stroke-width="4" stroke-dasharray="24 18" opacity="0.45"/>
    <text x="50%" y="47%" text-anchor="middle" fill="${EMERALD}"
          font-family="Arial, Helvetica, sans-serif" font-size="210" font-weight="700"
          letter-spacing="8">${code}</text>
    <text x="50%" y="57%" text-anchor="middle" fill="${MUTED}"
          font-family="Arial, Helvetica, sans-serif" font-size="62" letter-spacing="4">
      ФОТО ГОТОВИТСЯ
    </text>
  </svg>`);
}

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

let made = 0;
let kept = 0;

for (const [code, file] of SETS) {
  const path = join(OUT, `${file}.webp`);
  // НАСТОЯЩИЙ СНИМОК НЕ ПЕРЕЗАПИСЫВАЕМ. Скрипт идемпотентен и безопасен на
  // повторном запуске: он заполняет пустоты, а не наводит порядок по-своему.
  if (existsSync(path)) {
    kept += 1;
    continue;
  }
  await sharp(tile(code)).webp({ quality: 88 }).toFile(path);
  made += 1;
}

console.log(`🖼  заглушек создано: ${made}, оставлено как есть: ${kept}`);

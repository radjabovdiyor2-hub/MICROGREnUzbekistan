// ════════════════════════════════════════════════════════════
// QR-коды номера → content/templates/<slug>-qr.json
//   node scripts/build-magazine-qr.mjs [конфиг.json]
//
// ИСТОЧНИК ПРАВДЫ — АДМИНКА
// Коды в журнале обязаны вести туда, куда ведёт выдача админки после
// загрузки видео блюда. Адреса собираются теми же функциями и с теми же
// опциями, что apps/web/src/lib/magazine/qr.ts:
//   dishUrl(slug, code) → /m/<slug>/d/<code>
//   menuUrl(slug)       → /m/<slug>
//   PRINT_OPTS          → margin 4, errorCorrectionLevel 'M'
// QR детерминирован: одинаковый адрес + та же коррекция дают тот же
// рисунок модулей, что отдаёт кнопка «⬇ QR SVG» в админке. Проверить
// можно, выгрузив оттуда SVG и сравнив с этим файлом.
//
// ЧЕГО ЗДЕСЬ НЕТ
// Схемы «блюда — это /m/<slug>/d/1…6». Коды блюд присваивает база при
// загрузке видео, они произвольные (у Jasmin — 3,5,6,7,8,9) и берутся из
// dishCodes в конфиге. Именно этот хардкод в build-magazine.mjs и в
// docs/magazine-print-spec.md привёл к тому, что 30.07.2026 в номер
// попали два кода на несуществующий /m/jasmin, а сторонний скрипт затем
// «исправил» по ним и правильные шесть.
//
// Тихая зона: light задан прозрачным, а не белым. Рисунок модулей от
// этого не меняется (сравнение с админкой остаётся валидным), но на
// бумаге цвета --paper код не обводится белым прямоугольником.
// ════════════════════════════════════════════════════════════
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TPL = join(ROOT, 'content', 'templates');
const SITE = process.env.NEXT_PUBLIC_URL || 'https://microgreenuzbekistan.com';
const TELEGRAM_BOT = 'Microgreenuzbekistan_bot';

// Те же опции, что PRINT_OPTS в apps/web/src/lib/magazine/qr.ts
const OPTS = { margin: 4, errorCorrectionLevel: 'M', type: 'svg', color: { dark: '#000000', light: '#0000' } };

const cfgPath = process.argv[2] ? resolve(process.argv[2]) : join(TPL, 'jasmin.json');
const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));

const menuSlug = cfg.menuSlug;
if (!menuSlug) throw new Error(`${cfgPath}: нет menuSlug — слага ресторана из админки, без него QR некуда вести`);
const codes = cfg.dishCodes;
if (!Array.isArray(codes) || codes.length !== 6) {
  throw new Error(`${cfgPath}: dishCodes должен быть массивом из 6 кодов блюд из админки, получено ${JSON.stringify(codes)}`);
}

const targets = {
  MENU: `${SITE}/m/${encodeURIComponent(menuSlug)}`,
  RECIPE: `${SITE}/recipe/${encodeURIComponent(cfg.recipeSlug)}`,
  BOT: `https://t.me/${TELEGRAM_BOT}`,
};
codes.forEach((code, i) => { targets[`D${i + 1}`] = `${SITE}/m/${encodeURIComponent(menuSlug)}/d/${code}`; });

const out = {};
const urls = {};
for (const [key, url] of Object.entries(targets)) {
  let svg = (await QRCode.toString(url, OPTS)).replace(/<\?xml[^>]*\?>/, '').trim();
  const vb = svg.match(/viewBox="[^"]*"/)?.[0] ?? '';
  // Размер навязывает контейнер .menu-qr через width:100% — здесь только viewBox
  out[key] = svg.replace(/<svg[^>]*>/, `<svg xmlns="http://www.w3.org/2000/svg" ${vb} shape-rendering="crispEdges">`);
  urls[key] = url;
}

const file = join(TPL, `${cfg.slug}-qr.json`);
await writeFile(file, JSON.stringify(out, null, 1), 'utf8');
// Адреса рядом в открытом виде: чтобы проверить, куда ведут коды, не нужен декодер
await writeFile(join(TPL, `${cfg.slug}-qr.urls.json`), JSON.stringify(urls, null, 2), 'utf8');

console.log(`✓ ${file}`);
for (const [k, v] of Object.entries(urls)) console.log(`  ${k.padEnd(7)} ${v}`);
console.log('\nСверить с админкой: «🎬 Загрузить видео → получить QR» → ⬇ QR SVG');

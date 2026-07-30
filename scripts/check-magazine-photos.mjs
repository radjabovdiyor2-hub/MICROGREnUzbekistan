// ════════════════════════════════════════════════════════════
// Разрешение фотографий номера под печать 300 dpi.
//   node scripts/check-magazine-photos.mjs [конфиг.json]
//
// Зачем: это уже дважды прошло незамеченным. Спека предупреждала прямым
// текстом («в прототипе все фото были 1024×1024, и на обложке это давало
// 175 dpi вместо 300»), и всё равно в номере №1 обложка снова оказалась
// 1024×1024 — то есть 120 dpi при формате 154×216 мм. На экране и в
// домашней печати на A4 это не видно, в типографском тираже обложка мылит.
//
// Считаем так: снимок вписывается в слот через object-fit: cover, поэтому
// решает тот масштаб, который БОЛЬШЕ — по ширине или по высоте. Берём
// минимальный из двух получившихся dpi: это и есть фактическая
// детализация в худшем измерении.
//
// Размеры слотов держатся здесь: это единственное место, где они нужны
// после того, как автоматическая сборка ушла из процесса. Значения должны
// совпадать с content/templates/fresh-weekly-a5.design.css.
// ════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TPL = join(ROOT, 'content', 'templates');
const IMG = join(ROOT, 'content', 'generated');

// мм на макете: [ширина, высота]
const SLOTS = {
  PHOTO_COVER: [154, 216],          // обложка в край, вместе с вылетами
  PHOTO_CHEF: [38, 48],             // .photo-portrait
  PHOTO_RESTAURANT: [128, 44],      // .photo-hero / .photo-wide
  PHOTO_RECIPE: [128, 44],
  PHOTO_HEALTH: [128, 44],
  PHOTO_KIDS: [128, 44],
  PHOTO_FARM: [128, 44],
  PHOTO_GUEST_1: [39, 52], PHOTO_GUEST_2: [39, 52], PHOTO_GUEST_3: [39, 52],
  PHOTO_GUEST_4: [39, 52], PHOTO_GUEST_5: [39, 52], PHOTO_GUEST_6: [39, 52],
};
for (let i = 1; i <= 6; i++) SLOTS[`PHOTO_DISH_${i}`] = [26.5, 26.5];  // .menu-photo

const MIN_DPI = 300;
const WARN_DPI = 240;   // ниже этого мягкость видна невооружённым глазом

/** Размер PNG/JPEG из заголовка, без внешних зависимостей. */
function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      // SOF0..SOF15, кроме DHT(C4), JPGA(C8), DAC(CC)
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      if (m === 0xd8 || m === 0xd9 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

const cfgPath = process.argv[2] ? resolve(process.argv[2]) : join(TPL, 'jasmin.json');
const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));

const rows = [];
let low = 0, tight = 0, missing = 0;

for (const [key, [mmW, mmH]] of Object.entries(SLOTS)) {
  const file = cfg.photos?.[key];
  if (!file) { rows.push({ 'слот': key, 'файл': '— не задан', 'пиксели': '', 'нужно': '', 'dpi': '' }); missing++; continue; }

  let buf;
  try { buf = await readFile(join(IMG, file)); }
  catch { rows.push({ 'слот': key, 'файл': file, 'пиксели': 'НЕТ ФАЙЛА', 'нужно': '', 'dpi': '' }); missing++; continue; }

  const size = imageSize(buf);
  if (!size) { rows.push({ 'слот': key, 'файл': file, 'пиксели': 'не прочитан', 'нужно': '', 'dpi': '' }); continue; }

  const needW = Math.round((mmW / 25.4) * MIN_DPI);
  const needH = Math.round((mmH / 25.4) * MIN_DPI);
  const dpi = Math.floor(Math.min(size.w / (mmW / 25.4), size.h / (mmH / 25.4)));

  if (dpi < WARN_DPI) low++;
  else if (dpi < MIN_DPI) tight++;

  rows.push({
    'слот': key,
    'файл': file,
    'пиксели': `${size.w}×${size.h}`,
    'нужно': `${needW}×${needH}`,
    'dpi': `${dpi}${dpi < WARN_DPI ? '  МАЛО' : dpi < MIN_DPI ? '  впритык' : ''}`,
  });
}

console.table(rows);
console.log(`порог: ${MIN_DPI} dpi (мягкость заметна ниже ${WARN_DPI})`);

if (missing) console.warn(`⚠ не заданы или отсутствуют: ${missing}`);
if (tight) console.warn(`⚠ впритык (${WARN_DPI}–${MIN_DPI} dpi): ${tight}`);
if (low) {
  console.error(`\n✗ ниже ${WARN_DPI} dpi: ${low}. Для типографского тиража снимки нужно перевыпустить в размере из колонки «нужно».`);
  process.exit(1);
}
console.log('\n✓ все снимки держат 300 dpi');

// ════════════════════════════════════════════════════════════
// Сборка печатного номера FRESH WEEKLY из мастер-шаблона.
//   node scripts/build-magazine.mjs [конфиг.json]
//
// Что делает:
//   1. подставляет данные ресторана в {{...}};
//   2. генерирует SVG-QR (вектор — режется без пикселизации на любом кегле);
//   3. встраивает CSS и шрифты в файл, чтобы печатный HTML собирался
//      без интернета и типография получила самодостаточный документ;
//   4. подставляет фото или рисует слот с требуемым размером, если снимка нет.
//
// Результат: content/generated/<slug>-print.html → печатать в PDF
// (Ctrl+P, размер 154×216 мм, поля 0, фоновая графика включена).
// ════════════════════════════════════════════════════════════
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TPL = join(ROOT, 'content', 'templates');
const OUT = join(ROOT, 'content', 'generated');
const FONT_CACHE = join(TPL, 'fonts');

const SITE = process.env.NEXT_PUBLIC_URL || 'https://microgreenuzbekistan.com';

// Те же опции, что в apps/web/src/lib/magazine/qr.ts: тихая зона 4 и
// коррекция M — без них код плохо читается с матовой бумаги.
const QR_OPTS = { margin: 4, errorCorrectionLevel: 'M', type: 'svg', color: { dark: '#000000', light: '#ffffff' } };

// Слоты фото: размер на макете и минимум в пикселях под 300 dpi.
// Дублируется в docs/magazine-print-spec.md — там же объяснение.
const PHOTO_SLOTS = {
  PHOTO_COVER:      { mm: '154×216', px: '1820×2551', what: 'Обложка (в край)' },
  PHOTO_CHEF:       { mm: '38×48',   px: '450×570',   what: 'Портрет шефа' },
  PHOTO_RESTAURANT: { mm: '128×45',  px: '1512×532',  what: 'Зал ресторана' },
  PHOTO_RECIPE:     { mm: '128×38',  px: '1512×449',  what: 'Готовое блюдо рецепта' },
  PHOTO_HEALTH:     { mm: '128×36',  px: '1512×425',  what: 'Микрозелень крупно' },
  PHOTO_KIDS:       { mm: '128×36',  px: '1512×425',  what: 'Ребёнок и ростки' },
  PHOTO_FARM:       { mm: '128×36',  px: '1512×425',  what: 'Ферма, стеллажи' },
  PHOTO_DISH_1:     { mm: '24×24',   px: '300×300',   what: 'Блюдо 1' },
  PHOTO_DISH_2:     { mm: '24×24',   px: '300×300',   what: 'Блюдо 2' },
  PHOTO_DISH_3:     { mm: '24×24',   px: '300×300',   what: 'Блюдо 3' },
  PHOTO_DISH_4:     { mm: '24×24',   px: '300×300',   what: 'Блюдо 4' },
  PHOTO_DISH_5:     { mm: '24×24',   px: '300×300',   what: 'Блюдо 5' },
  PHOTO_DISH_6:     { mm: '24×24',   px: '300×300',   what: 'Блюдо 6' },
  PHOTO_GUEST_1:    { mm: '30×53',   px: '355×627',   what: 'Кадр гостя 1' },
  PHOTO_GUEST_2:    { mm: '30×53',   px: '355×627',   what: 'Кадр гостя 2' },
  PHOTO_GUEST_3:    { mm: '30×53',   px: '355×627',   what: 'Кадр гостя 3' },
  PHOTO_GUEST_4:    { mm: '30×53',   px: '355×627',   what: 'Кадр гостя 4' },
  PHOTO_GUEST_5:    { mm: '30×53',   px: '355×627',   what: 'Кадр гостя 5' },
  PHOTO_GUEST_6:    { mm: '30×53',   px: '355×627',   what: 'Кадр гостя 6' },
};

// Шрифты номера. Конкретные ссылки на файлы не хардкодим — Google меняет
// хеши в путях; спрашиваем CSS API и забираем подмножества latin + cyrillic
// (узбекская латиница и русский живут в одном номере).
const FONT_QUERY = 'family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400'
  + '&family=Inter:wght@400;600;700;800'
  + '&family=Playfair+Display:wght@700;800;900'
  + '&display=block';
const WANTED_SUBSETS = ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'];

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

/**
 * Собирает @font-face с base64-шрифтами. Кэширует и CSS, и сами файлы:
 * пересборка номера не должна зависеть от сети.
 */
async function fontCss() {
  await mkdir(FONT_CACHE, { recursive: true });
  const cachedCss = join(FONT_CACHE, 'fonts.css');
  if (await exists(cachedCss)) return readFile(cachedCss, 'utf8');

  let css;
  try {
    // User-Agent современного браузера — иначе Google отдаёт ttf вместо woff2
    const res = await fetch(`https://fonts.googleapis.com/css2?${FONT_QUERY}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    css = await res.text();
  } catch (e) {
    console.warn(`  ! шрифты не скачаны (${e.message}) — в макете будут системные замены`);
    return '';
  }

  // CSS от Google идёт блоками: /* subset */ @font-face { ... src: url(...) }
  const blocks = css.split('/*').filter((b) => b.includes('@font-face'));
  const out = [];
  let n = 0;
  for (const block of blocks) {
    const subset = block.slice(0, block.indexOf('*/')).trim();
    if (!WANTED_SUBSETS.includes(subset)) continue;
    const url = block.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
    if (!url) continue;

    const name = url.split('/').pop();
    const local = join(FONT_CACHE, name);
    let buf;
    if (await exists(local)) {
      buf = await readFile(local);
    } else {
      const r = await fetch(url);
      if (!r.ok) continue;
      buf = Buffer.from(await r.arrayBuffer());
      await writeFile(local, buf);
    }
    const face = block.slice(block.indexOf('@font-face'))
      .replace(/src:\s*url\([^)]+\)\s*format\([^)]+\)/, `src:url(data:font/woff2;base64,${buf.toString('base64')}) format('woff2')`);
    out.push(face.trim());
    n++;
  }
  const result = out.join('\n');
  await writeFile(cachedCss, result, 'utf8');
  console.log(`  шрифты встроены: ${n} начертаний`);
  return result;
}

async function qrSvgInline(url, sizeMm) {
  let svg = await QRCode.toString(url, QR_OPTS);
  svg = svg.replace(/<\?xml[^>]*\?>/, '').trim();
  // навязываем размер на макете, сохраняя родной viewBox
  const vb = svg.match(/viewBox="[^"]*"/)?.[0] ?? '';
  return svg.replace(/<svg[^>]*>/, `<svg xmlns="http://www.w3.org/2000/svg" width="${sizeMm}mm" height="${sizeMm}mm" ${vb} shape-rendering="crispEdges">`);
}

function photoSlotHtml(key) {
  const s = PHOTO_SLOTS[key];
  // Плейсхолдер рисуется в пропорции самого слота: иначе object-fit: cover
  // срезает подпись, и на макете не видно, какого снимка не хватает.
  const [mmW, mmH] = s.mm.split('×').map(Number);
  const W = 800;
  const H = Math.round((W * mmH) / mmW);
  // На больших слотах (обложка) подпись держим мелкой и уводим вверх, иначе
  // она перекрывает вёрстку и мешает оценить полосу.
  const big = mmW > 100 && mmH > 100;
  const fs = big ? 30 : Math.round(Math.min(W, H) * 0.075);
  const y = big ? Math.round(H * 0.12) : H / 2 - fs * 0.2;
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <rect width="${W}" height="${H}" fill="#e6e2da"/>
      <rect x="8" y="8" width="${W - 16}" height="${H - 16}" fill="none" stroke="#c9a876" stroke-width="4" stroke-dasharray="14 10"/>
      <text x="${W / 2}" y="${y}" text-anchor="middle" font-family="Inter,sans-serif" font-size="${fs}" fill="#8a7a5e">${s.what}</text>
      <text x="${W / 2}" y="${y + fs * 1.35}" text-anchor="middle" font-family="Inter,sans-serif" font-size="${Math.round(fs * 0.8)}" fill="#a89880">${s.mm} мм · ${s.px} px</text>
    </svg>`
  )}`;
}

// ── конфиг ──
const configPath = process.argv[2] ? resolve(process.argv[2]) : join(TPL, 'jasmin.json');
const cfg = JSON.parse(await readFile(configPath, 'utf8'));

const [template, css, fonts] = await Promise.all([
  readFile(join(TPL, 'fresh-weekly-a5.html'), 'utf8'),
  readFile(join(TPL, 'fresh-weekly-a5.css'), 'utf8'),
  fontCss(),
]);

let html = template;

// 1. Стили и шрифты — одним инлайновым блоком
const brandVars = `:root{--accent:${cfg.accent};--gold:${cfg.gold};}`;
html = html.replace('{{STYLES}}', `<style>\n${fonts}\n${css}\n${brandVars}\n</style>`);

// 2. QR
const qrMap = {
  QR_MENU: [`${SITE}/m/${cfg.slug}`, 18],
  QR_RECIPE: [`${SITE}/recipe/${cfg.recipeSlug}`, 20],
};
for (let i = 1; i <= 6; i++) qrMap[`QR_D${i}`] = [`${SITE}/m/${cfg.slug}/d/${i}`, 15];
for (const [key, [url, mm]] of Object.entries(qrMap)) {
  html = html.replaceAll(`{{${key}}}`, await qrSvgInline(url, mm));
}

// 3. Фото: реальный файл или слот со спекой
for (const key of Object.keys(PHOTO_SLOTS)) {
  const custom = cfg.photos?.[key];
  html = html.replaceAll(`{{${key}}}`, custom || photoSlotHtml(key));
}

// 4. Текстовые подстановки
const text = {
  RESTAURANT: cfg.restaurant,
  RESTAURANT_UP: cfg.restaurant.toUpperCase(),
  ISSUE: String(cfg.issue),
  ISSUE_DATE: cfg.issueDate,
  CHEF_NAME: cfg.chefName,
  ADDRESS: cfg.address,
  INSTAGRAM: cfg.instagram,
  SIGNATURE_DISH: cfg.signatureDish,
};
for (const [k, v] of Object.entries(text)) html = html.replaceAll(`{{${k}}}`, v);

// 5. Контроль: незакрытых плейсхолдеров остаться не должно
const left = [...html.matchAll(/\{\{([A-Z_0-9]+)\}\}/g)].map((m) => m[1]);
if (left.length) {
  console.error('Не подставлены плейсхолдеры:', [...new Set(left)].join(', '));
  process.exit(1);
}

await mkdir(OUT, { recursive: true });
const outFile = join(OUT, `${cfg.slug}-print.html`);
await writeFile(outFile, html, 'utf8');

const pages = (html.match(/class="mag-page/g) || []).length;
console.log(`✓ ${outFile}`);
console.log(`  полос: ${pages}${pages % 4 ? '  ⚠ НЕ кратно 4 — скрепкой не сброшюровать' : '  (кратно 4 — ок для скрепки)'}`);
console.log(`  размер: ${(html.length / 1024 / 1024).toFixed(1)} МБ`);
const missing = Object.keys(PHOTO_SLOTS).filter((k) => !cfg.photos?.[k]);
if (missing.length) console.log(`  фото не заданы (${missing.length}): показаны слоты со спекой`);

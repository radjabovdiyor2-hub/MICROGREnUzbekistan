// ════════════════════════════════════════════════════════════
// Проверка опубликованного номера: открывается ли он так, как его увидит
// читатель — с веб-корня, а не по file://.
//   node scripts/check-magazine-published.mjs [slug]
//
// ЗАЧЕМ ОТДЕЛЬНАЯ ПРОВЕРКА
// scripts/publish-magazine.mjs переписывает пути исходника под веб-корень.
// Проверяем номер ДВУМЯ способами, потому что у них разная арифметика путей:
//   · по http от /magazine/ — как его увидит читатель на сайте;
//   · по file:// — как его открывает владелец двойным щелчком.
// Абсолютный путь (/catalog/…) проходит первую проверку и молча проваливает
// вторую: по file:// он ведёт в корень диска, и номер показывается голым
// текстом. Так и случилось при первой публикации. Относительный путь
// (../catalog/…) работает в обоих случаях — эта проверка стережёт именно это.
//
// Падает с ненулевым кодом, если хоть один ассет не отдался или полос не 12.
// ════════════════════════════════════════════════════════════
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'apps', 'web', 'public');
const SLUG = process.argv[2] ?? 'shakar-01';
const EXPECT_PAGES = 12;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(req.url.split('?')[0]);
    const body = await readFile(join(PUBLIC, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();

const browser = await chromium.launch();
let bad = 0;

// Оба способа открытия. Разница между ними — вся суть проверки.
const WAYS = [
  ['сервер (как увидит читатель)', `http://127.0.0.1:${port}/magazine/${SLUG}.html`],
  ['двойной щелчок (file://)', pathToFileURL(join(PUBLIC, 'magazine', `${SLUG}.html`)).href],
];

for (const [label, url] of WAYS) {
  const page = await browser.newPage({ viewport: { width: 900, height: 1300 } });
  const failures = [];
  page.on('response', (r) => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`); });
  page.on('requestfailed', (r) => failures.push(`не загрузилось: ${r.url()}`));
  page.on('pageerror', (e) => failures.push(`JS: ${e.message}`));

  await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);

  const pages = (await page.$$('.mag-page')).length;
  const broken = await page.$$eval('img', (els) =>
    els.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute('src')));
  // Стили подключены отдельным файлом: если он не разрешился, полоса теряет
  // фиксированную высоту и номер превращается в простыню текста.
  const styled = await page.$eval('.mag-page', (el) => el.getBoundingClientRect().width > 300).catch(() => false);

  console.log(`\n${label}`);
  console.log(`  полос: ${pages} · битых изображений: ${broken.length} · стили: ${styled ? 'есть' : 'НЕТ'}`);
  broken.forEach((s) => console.error(`  ✗ не загрузилось: ${s}`));
  failures.slice(0, 8).forEach((f) => console.error(`  ✗ ${f}`));

  if (pages !== EXPECT_PAGES) {
    console.error(`  ✗ ожидалось ${EXPECT_PAGES} полос (кратно 4 — требование брошюровки)`);
    bad += 1;
  }
  if (!styled) {
    console.error('  ✗ дизайн-слой не подключился — номер откроется голым текстом');
    bad += 1;
  }
  if (broken.length || failures.length) bad += 1;

  await page.close();
}

await browser.close();
server.close();

if (bad) {
  console.error('\n✗ номер опубликован с битыми ссылками — проверьте scripts/publish-magazine.mjs.');
  console.error('  Пути должны быть относительными: абсолютный /catalog/… проходит по http');
  console.error('  и молча ломается по file://, потому что ведёт в корень диска.');
  process.exit(1);
}
console.log(`\n✓ /magazine/${SLUG}.html открывается целиком обоими способами.`);

// ════════════════════════════════════════════════════════════
// Генерация N персональных PDF из печатного роута /magazine/print/<slug>.
// Заменяет захардкоженный content/generate_pdf.js.
//
// Использование:
//   node scripts/generate-magazine-pdf.js ora osh-xona        # по slug
//   node scripts/generate-magazine-pdf.js                     # все status=ready (нужен BOT_SECRET)
//
// Требует запущенный сервер (npm run dev, порт 3005) или PDF_BASE_URL.
// ════════════════════════════════════════════════════════════
const path = require('path');
const fs = require('fs');

const BASE = process.env.PDF_BASE_URL || 'http://localhost:3005';
const OUT_DIR = path.resolve(__dirname, '..', 'content', 'generated');

async function resolveSlugs() {
  const args = process.argv.slice(2).filter(Boolean);
  if (args.length) return args;

  // Без аргументов — тянем готовые выпуски из admin-API (server-to-server через BOT_SECRET)
  const secret = process.env.BOT_SECRET;
  if (!secret) {
    console.error('Укажите slug аргументами, либо задайте BOT_SECRET для авто-выборки status=ready.');
    process.exit(1);
  }
  const res = await fetch(`${BASE}/api/admin/magazine/issues`, { headers: { 'x-bot-secret': secret } });
  if (!res.ok) { console.error('Не удалось получить список выпусков:', res.status); process.exit(1); }
  const issues = await res.json();
  return issues.filter((i) => i.status === 'ready' || i.status === 'published').map((i) => i.webSlug);
}

(async () => {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch (e) {
    console.error('Playwright не найден. Выполните: npx playwright install chromium');
    process.exit(1);
  }

  const slugs = await resolveSlugs();
  if (!slugs.length) { console.log('Нет выпусков для генерации.'); return; }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  for (const slug of slugs) {
    const url = `${BASE}/magazine/print/${slug}`;
    console.log(`→ ${url}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      // Фон/цвета карточек в печати
      await page.addStyleTag({
        content: '@media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }',
      });
      const pdfPath = path.join(OUT_DIR, `${slug}.pdf`);
      await page.pdf({ path: pdfPath, format: 'A5', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
      console.log(`  ✅ ${pdfPath}`);
    } catch (e) {
      console.error(`  ✖ Ошибка для ${slug}:`, e.message);
    }
  }

  await browser.close();
  console.log('Готово.');
})();

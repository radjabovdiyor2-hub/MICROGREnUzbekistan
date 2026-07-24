// Скриншоты отдельных полос номера — быстрый визуальный контроль вёрстки.
//   node scripts/shoot-magazine-pages.mjs <выходная-папка> [номера через запятую]
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { mkdir } from 'node:fs/promises';

const out = resolve(process.argv[2] ?? 'content/generated/pages');
const want = (process.argv[3] ?? '').split(',').filter(Boolean).map(Number);
const file = resolve('content/generated/jasmin-print.html');

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1300 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });

const pages = await page.$$('.mag-page');
for (let i = 0; i < pages.length; i++) {
  const n = i + 1;
  if (want.length && !want.includes(n)) continue;
  await pages[i].screenshot({ path: join(out, `page-${String(n).padStart(2, '0')}.png`) });
}
await browser.close();
console.log(`✓ полосы сняты в ${out}`);

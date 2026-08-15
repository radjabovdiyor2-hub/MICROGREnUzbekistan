// Скриншоты отдельных полос номера — быстрый визуальный контроль вёрстки.
//   node scripts/shoot-magazine-pages.mjs <выходная-папка> [номера через запятую] [--src=<html>]
//
// Номер задаётся флагом --src, а не третьим позиционным аргументом: третьим
// уже идут номера полос, и номеров в репозитории теперь больше одного.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { mkdir } from 'node:fs/promises';

const args = process.argv.slice(2);
const srcFlag = args.find((a) => a.startsWith('--src='));
const positional = args.filter((a) => !a.startsWith('--'));

const out = resolve(positional[0] ?? 'content/generated/pages');
const want = (positional[1] ?? '').split(',').filter(Boolean).map(Number);
const file = resolve(srcFlag ? srcFlag.slice('--src='.length) : 'content/generated/jasmin-print.html');

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1300 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
// Шрифты вшиты base64, но раскладка считается уже после их применения —
// без ожидания пруф снимается системной подменой и врёт по высоте строк.
await page.evaluate(() => document.fonts.ready);

const pages = await page.$$('.mag-page');
for (let i = 0; i < pages.length; i++) {
  const n = i + 1;
  if (want.length && !want.includes(n)) continue;
  await pages[i].screenshot({ path: join(out, `page-${String(n).padStart(2, '0')}.png`) });
}
await browser.close();
console.log(`✓ полосы сняты в ${out}`);

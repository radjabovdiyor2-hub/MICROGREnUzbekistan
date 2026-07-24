// ════════════════════════════════════════════════════════════
// Контроль вместимости полос печатного номера.
//   node scripts/check-magazine-fit.mjs [файл.html]
//
// Зачем: у .page-body высота фиксирована и стоит overflow:hidden —
// лишний контент не ломает вёрстку заметно, он молча уходит под обрез.
// На экране полоса выглядит целой, а в PDF пропадает последний блок.
// Скрипт меряет запас каждой полосы и падает, если где-то минус.
// ════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const file = resolve(process.argv[2] ?? 'content/generated/jasmin-print.html');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });

const rows = await page.evaluate(() => {
  const toMm = (px) => +(px / (96 / 25.4)).toFixed(1);
  return [...document.querySelectorAll('.mag-page')].map((p, i) => {
    const body = p.querySelector('.page-body');
    if (!body) return { 'полоса': i + 1, 'запас, мм': '—', 'сжато блоков': '—', 'заметка': 'обложка' };

    // .page-body — flex-колонка: лишний контент не переполняет её, а ужимает
    // блоки. Поэтому смотрим на каждого прямого ребёнка: если его scrollHeight
    // больше видимой высоты, текст внутри уже режется.
    const kids = [...body.children];
    // Порог 4px ≈ 1мм: у заголовков с line-height < 1.1 scrollHeight всегда
    // на доли миллиметра больше из-за выносных элементов — это не обрезка.
    const squeezed = kids.filter((el) => el.scrollHeight - el.clientHeight > 4);

    // Запас = сколько ещё влезет: разница между высотой бокса и суммой
    // естественных высот детей с учётом gap.
    const gap = parseFloat(getComputedStyle(body).rowGap) || 0;
    const natural = kids.reduce((s, el) => s + Math.max(el.scrollHeight, el.getBoundingClientRect().height), 0)
      + gap * Math.max(0, kids.length - 1);

    return {
      'полоса': i + 1,
      'запас, мм': toMm(body.clientHeight - natural),
      'сжато блоков': squeezed.length,
      'заметка': squeezed.length ? squeezed.map((e) => e.className || e.tagName).join(', ').slice(0, 40) : '',
    };
  });
});

console.table(rows);
await browser.close();

const over = rows.filter((r) => typeof r['запас, мм'] === 'number' && r['запас, мм'] < 0);
const cut = rows.filter((r) => typeof r['сжато блоков'] === 'number' && r['сжато блоков'] > 0);
if (over.length || cut.length) {
  if (over.length) console.error(`\n✗ Не хватает места на полосах: ${over.map((r) => r['полоса']).join(', ')}`);
  if (cut.length) console.error(`✗ Контент режется на полосах: ${cut.map((r) => r['полоса']).join(', ')}`);
  process.exit(1);
}
console.log('\n✓ Все полосы вмещают контент');

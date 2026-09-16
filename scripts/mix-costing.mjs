// ════════════════════════════════════════════════════════════
// Сырьевая себестоимость миксов 100 г против норматива 30 %
//   node scripts/mix-costing.mjs [--pack <сум>] [--yield <г>]
//
// ЗАЧЕМ ЭТОТ СКРИПТ
// Цены миксов 40 000–55 000 стоят в прайсе, а §3.1 doc/balans_concept.md
// требует держать себестоимость в 30 % от цены. Проверить это глазами нельзя:
// микс — смесь долей, и каждая доля берётся из своей строки прайса.
//
// ЧЕГО В ПРОЕКТЕ НЕТ — И ПОЧЕМУ СЧИТАЕМ ИНАЧЕ
// Справочник норм выхода (`seed-crop-norms.ts`) удалён вместе с
// производственным разделом, и §7 doc/product-sets-spec.md прямо фиксирует:
// лотки не взвешены, выход не измерен ни по одной культуре. Значит цена
// грамма микрозелени НЕИЗВЕСТНА, и подставить её наугад — значит выдать
// догадку за расчёт.
//
// Поэтому задача решается наоборот: выход лотка берётся неизвестным Y, и
// скрипт считает, при каком Y микс укладывается в норматив. Получается не
// «себестоимость такая-то», а «цена верна, если лоток даёт не меньше N
// граммов» — проверяемое утверждение, закрываемое одними весами.
//
// ОТКУДА ЦИФРЫ. Цены — из price-list.html, того же источника, что и витрина.
// Составы — из enrich.ts. Здесь не заводится ни одной своей цены: разойдись
// они с прайсом, расчёт молча считал бы несуществующий товар.
//
// ЭТО ОТЧЁТ, А НЕ ГЕЙТ: выход всегда 0. Гейтом он станет, когда появятся
// измеренные выходы — тогда «не проходит» будет фактом, а не сценарием.
// ════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Норматив фин-модели: §3.1 doc/balans_concept.md. */
const NORM = 0.30;

/** Сценарии выхода лотка. Границы — из §3.1, 180 г это измеренный амарант. */
const SCENARIOS = [180, 300, 500];

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : fallback;
};
/** Упаковка, саше сборки и этикетка. В проекте цифры нет — задаётся руками. */
const PACK = argOf('--pack', 0);

// ── Чем компонент состава торгуется ──────────────────────────────────
//
// Имя в составе → слаг прайса. Это ЕДИНСТВЕННОЕ знание, которого нет в
// файлах: «шпинат» и «кейл» в прайсе бывают только бейби-листом, всё
// остальное берётся микрозеленью. Длинные имена проверяются первыми, иначе
// «мизуна красная» опознается как «мизуна».
// У миксов состав двуязычный, у BALANS — только узбекский, поэтому карта
// знает оба написания. Прилагательное стоит то впереди, то позади («qizil
// mizuna» и «Mizuna qizil»), и цветные формы проверяются раньше простых —
// иначе красная мизуна опознается как зелёная и подешевеет на четверть.
//
// Кольраби нет ни строкой прайса, ни в этой карте намеренно: культура входит
// в состав BALANS Крестоцветного, но отдельно не продаётся, и цены у неё нет.
const COMPONENT = [
  ['qizil mizuna', 'mizuna-red'],
  ['mizuna qizil', 'mizuna-red'],
  ['qizil pakchoy', 'pakchoy-red'],
  ['pakchoy qizil', 'pakchoy-red'],
  ['qizil gorchitsa', 'gorchitsa-red'],
  ['gorchitsa qizil', 'gorchitsa-red'],
  ['redis sango', 'redis-sango'],
  ['kungaboqar', 'kungaboqar-micro'],
  ['kashnich', 'kashnich-micro'],
  ['brokkoli', 'brokkoli-micro'],
  ['amarant', 'amarant-micro'],
  ['rukkola', 'rukkola-micro'],
  ['mizuna', 'mizuna-green'],
  ['tatsoy', 'tatsoy-micro'],
  ['ismaloq', 'ismaloq-baby'],
  ['pakchoy', 'pakchoy-green'],
  ['gorchitsa', 'gorchitsa-micro'],
  ['mangold', 'mangold-micro'],
  ["no'xat", 'noxat-micro'],
  ['rayhon', 'rayhon-micro'],
  ['redis', 'redis-micro'],
  ['kress', 'kress-micro'],
  ['keyl', 'keyl-baby'],
  ['мизуна красная', 'mizuna-red'],
  ['редис санго', 'redis-sango'],
  ['санго', 'redis-sango'],
  ['пак-чой красный', 'pakchoy-red'],
  ['пак-чой', 'pakchoy-green'],
  ['горчица красная', 'gorchitsa-red'],
  ['горчица', 'gorchitsa-micro'],
  ['подсолнечник', 'kungaboqar-micro'],
  ['кориандр', 'kashnich-micro'],
  ['мангольд', 'mangold-micro'],
  ['брокколи', 'brokkoli-micro'],
  ['амарант', 'amarant-micro'],
  ['руккола', 'rukkola-micro'],
  ['мизуна', 'mizuna-green'],
  ['татсой', 'tatsoy-micro'],
  ['шпинат', 'ismaloq-baby'],
  ['редис', 'redis-micro'],
  ['горох', 'noxat-micro'],
  ['кресс', 'kress-micro'],
  ['кейл', 'keyl-baby'],
];

/**
 * Где состав уточняет форму. В «Вкусах недели» руккола взята бейби-листом
 * (doc/product-mix-lines.md, таблица KUNLIK) — лист, а не проросток.
 */
const OVERRIDES = { 'miks-tamlar': { 'руккола': 'rukkola-baby' } };

// ── Прайс ────────────────────────────────────────────────────────────
function readPrices() {
  const html = readFileSync(join(ROOT, 'apps/web/public/catalog/price-list.html'), 'utf8');
  const out = new Map();
  for (const table of html.match(/<table[\s\S]*?<\/table>/g) ?? []) {
    const unit = table.match(/data-unit="([^"]+)"/)?.[1] ?? '';
    for (const row of table.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
      const file = row.match(/([A-Za-z0-9_-]+)\.webp/)?.[1];
      if (!file) continue;
      const text = row.replace(/<[^>]+>/g, ' ');
      const price = [...text.matchAll(/(\d[\d\s ]{4,})/g)]
        .map((m) => Number(m[1].replace(/[\s ]/g, '')))
        .filter((n) => n >= 1000)
        .pop();
      if (price) out.set(file.replace(/_/g, '-'), { price, unit });
    }
  }
  return out;
}

// ── Составы ──────────────────────────────────────────────────────────
function readMixes() {
  const src = readFileSync(join(ROOT, 'packages/database/prisma/enrich.ts'), 'utf8');
  const mixes = [];
  for (const block of src.match(/'(?:miks|balans)-[a-z0-9-]+':[\s\S]*?\n    \},/g) ?? []) {
    const slug = block.match(/'((?:miks|balans)-[a-z0-9-]+)'/)[1];
    const raw = block.match(/"Tarkibi \/ Состав":\s*"([^"]+)"/)?.[1];
    if (!raw) continue;                       // коробка и киты — не смесь долей
    const parts = [];
    for (const piece of raw.split(' / ').pop().split(',')) {
      const m = piece.trim().match(/^(.+?)\s+(\d+)\s*%$/);
      if (m) parts.push({ name: m[1].trim().toLowerCase(), share: Number(m[2]) / 100 });
    }
    if (parts.length) mixes.push({ slug, parts });
  }
  return mixes;
}

const prices = readPrices();
const mixes = readMixes();
const money = (n) => Math.round(n).toLocaleString('ru-RU');

console.log(`\nСырьевая себестоимость 100 г против норматива ${NORM * 100} %`);
console.log(`Упаковка и сборка: ${PACK ? money(PACK) + ' сум' : 'не заданы (--pack)'}\n`);

const rows = [];
for (const mix of mixes) {
  const sale = prices.get(mix.slug)?.price;
  if (!sale) continue;

  // A — микрозелень: цена за грамм равна цене лотка, делённой на выход Y.
  // B — то, что продаётся на вес: цена грамма известна, от Y не зависит.
  let A = 0, B = 0;
  const unknown = [];
  for (const part of mix.parts) {
    const slug = OVERRIDES[mix.slug]?.[part.name]
      ?? COMPONENT.find(([name]) => part.name.includes(name))?.[1];
    const row = slug && prices.get(slug);
    if (!row) { unknown.push(part.name); continue; }
    if (row.unit === 'лоток') A += part.share * 100 * row.price;
    else if (row.unit === '100 г') B += part.share * row.price;
    else if (row.unit === 'кг') B += part.share * 100 * (row.price / 1000);
  }

  const budget = NORM * sale - B - PACK;
  rows.push({
    slug: mix.slug, sale, B, unknown,
    need: budget > 0 ? A / budget : null,
    at: SCENARIOS.map((y) => A / y + B + PACK),
  });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('микс', 18) + pad('цена', 9) + pad('порог выхода', 15)
  + SCENARIOS.map((y) => pad(y + ' г', 11)).join(''));
console.log('─'.repeat(18 + 9 + 15 + 11 * SCENARIOS.length));

for (const r of rows.sort((a, b) => (b.need ?? 1e9) - (a.need ?? 1e9))) {
  // Микс с компонентом без цены НЕ получает вердикта. Сумма по остальным
  // долям выглядела бы как готовый ответ — и чем больше цен не хватает, тем
  // увереннее «проходит с запасом». Пустая клетка честнее заниженной.
  const blocked = r.unknown.length > 0;
  const need = blocked ? 'не посчитан'
    : r.need === null ? 'недостижим' : `${Math.ceil(r.need)} г/лоток`;
  const cells = blocked ? '—'
    : r.at.map((c) => pad(`${money(c)}${c <= NORM * r.sale ? ' ✓' : ' ✗'}`, 11)).join('');
  console.log(pad(r.slug, 18) + pad(money(r.sale), 9) + pad(need, 15) + cells);
  if (blocked) console.log(`${' '.repeat(18)}└ нет цены: ${r.unknown.join(', ')}`);
}

const never = rows.filter((r) => !r.unknown.length && r.need === null);
const heavy = rows.filter((r) => !r.unknown.length && r.need !== null && r.need > 500);
console.log(`\n✓ — сырьё укладывается в ${NORM * 100} % от цены при таком выходе лотка.`);
console.log(`Норматив недостижим ни при каком выходе: ${never.length}`
  + (never.length ? ' — ' + never.map((r) => r.slug).join(', ') : ''));
console.log(`Требуют выхода выше 500 г: ${heavy.length}`
  + (heavy.length ? ' — ' + heavy.map((r) => r.slug).join(', ') : ''));
console.log('\nВыход лотка в проекте не измерен — это сценарии, а не факт.\n');

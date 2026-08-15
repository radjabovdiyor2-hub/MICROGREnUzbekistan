// ════════════════════════════════════════════════════════════
// Сверка публичных материалов со стоп-списком doc/balans_concept.md §6.2
//   node scripts/check-claims.mjs [доп-файл ...]
//
// ЗАЧЕМ ЭТО ОТДЕЛЬНЫЙ СКРИПТ
// Правило «никаких заявлений о лечебных и оздоровительных свойствах» живёт
// в комментариях к nutritionDb.ts, defaults.ts и balans/page.tsx. Комментарий
// не останавливает правку: в §6.3 концепции перечислено, что такие
// формулировки уже один раз просочились в каталог, JSON-LD и промпт продавца,
// и их вычищали вручную. Здесь то же правило исполняется машиной.
//
// ЧТО ПРОВЕРЯЕТСЯ
// Публичный контур: номер журнала, постеры, тексты публикаций, статические
// выпуски в apps/web/public/magazine. Закрытые документы (doc/*.md) — НЕ
// проверяются: там наука называется своим именем, и это законно, потому что
// они не являются рекламой и не публикуются.
//
// Выход 1 при любом совпадении. Это гейт, а не советчик.
// ════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'node:fs/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Публичный контур. Закрытые doc/*.md сюда намеренно не входят.
const TARGETS = [
  'content/generated/shakar-01-print.html',
  'content/posters/*.html',
  'content/posters/captions.md',
  'apps/web/public/magazine/shakar-01.html',
];

// Стоп-список §6.2. Ключ — что ищем, значение — чем это плохо.
// Границы слов не ставим: «диабетик», «диабетический», «профилактика» должны
// ловиться так же, как корень.
const BANNED = [
  [/диабет/iu, 'заявление о специальном назначении — §6.2'],
  [/diabet/iu, 'то же латиницей: qandli diabet / diabetes'],
  [/qand kasal/iu, 'то же по-узбекски'],
  [/снижа\w*\s+(?:уровень\s+)?сахар/iu, '«снижает сахар» — заявление о свойстве'],
  [/понижа\w*\s+(?:уровень\s+)?сахар/iu, '«понижает сахар» — заявление о свойстве'],
  [/shakarni\s+kamaytir/iu, '«снижает сахар» по-узбекски'],
  [/нормализу\w*\s+сахар/iu, '«нормализует сахар» — заявление о свойстве'],
  [/лечит|излечива|исцеля/iu, 'заявление о лечении болезни'],
  [/davola\w*\s+xossa/iu, 'заявление о лечебных свойствах по-узбекски'],
  [/профилактик/iu, 'заявление о снижении риска болезни'],
  [/детокс|detoks/iu, 'недоказуемый claim, вычищен в §6.3'],
  [/для\s+диабетик|диабетик\w*\s+для/iu, 'название специального назначения'],
  [/в\s+\d+\s*(?:раз|раза)\b/iu, 'сравнительный множитель без протокола испытаний'],
  [/\d+\s*marta\s+(?:ko[’'`]p|foydali)/iu, 'сравнительный множитель по-узбекски'],
  [/замен\w*\s+(?:лекарств|метформин|инсулин)/iu, 'заявление о замене терапии'],
];

// Исключения: строки, где совпадение допустимо и обосновано в самом файле.
// Пока пусто — любое исключение обязано появляться здесь вместе с причиной,
// а не тихо переписывать регулярку выше.
const ALLOW = [];

async function expand(pattern) {
  if (!pattern.includes('*')) return [pattern];
  const out = [];
  for await (const hit of glob(pattern, { cwd: ROOT })) out.push(hit);
  return out;
}

let checked = 0;
let hits = 0;

const patterns = [...TARGETS, ...process.argv.slice(2)];
for (const pattern of patterns) {
  for (const rel of await expand(pattern)) {
    let text;
    try {
      text = await readFile(join(ROOT, rel), 'utf8');
    } catch {
      // Файла ещё нет — это не нарушение. Гейт следит за содержимым,
      // а не за полнотой комплекта.
      continue;
    }
    checked += 1;

    text.split(/\r?\n/).forEach((line, i) => {
      if (ALLOW.some((a) => a.test(line))) return;
      for (const [re, why] of BANNED) {
        const m = line.match(re);
        if (!m) continue;
        hits += 1;
        console.error(`✗ ${relative('.', rel)}:${i + 1}  «${m[0]}» — ${why}`);
        console.error(`    ${line.trim().slice(0, 140)}`);
      }
    });
  }
}

if (!checked) {
  console.error('✗ не проверено ни одного файла — путь в TARGETS устарел');
  process.exit(1);
}

if (hits) {
  console.error(`\n✗ нарушений: ${hits} в ${checked} файлах.`);
  console.error('  Правило: утверждение о СВОЙСТВЕ → утверждение о СОСТАВЕ или вкусе.');
  console.error('  Основание: doc/balans_concept.md §6.2. Наука — в doc/dossier_glycemia.md, он не публикуется.');
  process.exit(1);
}

console.log(`✓ ${checked} файлов публичного контура — стоп-список §6.2 чист.`);

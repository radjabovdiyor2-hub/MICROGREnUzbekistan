// ══════════════════════════════════════════════════════════════════════
// Нормализация города для фильтров карты.
//
// Полная нормализация адреса — канон в Python (apps/tgas/shared/geo.py):
// только офис ходит к геокодерам и пишет кэш, и держать две реализации
// одного алгоритма в двух языках значит однажды получить два разных ключа
// на один адрес. Здесь остаётся ровно то, без чего не обойтись веб-части:
// приведение города к slug'у.
//
// Нужно это потому, что один и тот же Ташкент лежит в базе минимум пятью
// способами: `customers.city` по умолчанию "Samarqand", `orders.city` —
// "tashkent", менеджеры пишут «Ташкент», лид-ген кладёт «Toshkent», а
// узбекская кириллица добавляет «Тошкент». Фильтр «показать Ташкент»,
// сравнивающий сырую колонку, найдёт лишь одну пятую клиентов.
// ══════════════════════════════════════════════════════════════════════

import { CITY_SLUGS, type CitySlug } from './districts';

/**
 * Написания, которые считаем одним городом. Ключи уже приведены к нижнему
 * регистру и без апострофов — сравнение идёт после `simplify`.
 *
 * Города и посёлки Самаркандской области сведены сюда же к 'samarkand'.
 * Это не небрежность: slug города здесь означает ЗОНУ ОБСЛУЖИВАНИЯ, а не
 * населённый пункт — точное место живёт в `district`. Без этих строк
 * заведение с `city='Urgut'` выпадало из фильтра «Самарканд» и не
 * показывалось на карте вообще ни под одним фильтром, кроме «Все города».
 */
const CITY_ALIASES: Record<string, CitySlug> = {
  tashkent: 'tashkent',
  toshkent: 'tashkent',
  ташкент: 'tashkent',
  тошкент: 'tashkent',

  samarkand: 'samarkand',
  samarqand: 'samarkand',
  самарканд: 'samarkand',
  самарқанд: 'samarkand',
  samarqandviloyati: 'samarkand',
  самаркандскаяобласть: 'samarkand',

  // Районные центры Самаркандской области.
  bulungur: 'samarkand',
  булунгур: 'samarkand',
  ishtixon: 'samarkand',
  ishtikhan: 'samarkand',
  иштыхан: 'samarkand',
  иштихон: 'samarkand',
  jomboy: 'samarkand',
  джамбай: 'samarkand',
  жомбой: 'samarkand',
  kattaqorgon: 'samarkand',
  kattakurgan: 'samarkand',
  каттакурган: 'samarkand',
  каттақўрғон: 'samarkand',
  qoshrabot: 'samarkand',
  koshrabad: 'samarkand',
  кушработ: 'samarkand',
  кушрабад: 'samarkand',
  narpay: 'samarkand',
  нарпай: 'samarkand',
  nurobod: 'samarkand',
  нурабад: 'samarkand',
  нуробод: 'samarkand',
  oqdaryo: 'samarkand',
  akdarya: 'samarkand',
  акдарья: 'samarkand',
  pastdargom: 'samarkand',
  пастдаргом: 'samarkand',
  paxtachi: 'samarkand',
  пахтачи: 'samarkand',
  payariq: 'samarkand',
  пайарык: 'samarkand',
  паяриқ: 'samarkand',
  toyloq: 'samarkand',
  тайлак: 'samarkand',
  тайлоқ: 'samarkand',
  urgut: 'samarkand',
  ургут: 'samarkand',
  gulobod: 'samarkand',
  гулобод: 'samarkand',
};

/**
 * Апострофы в узбекской латинице приходят пятью разными символами
 * (ʻ ʼ ‘ ’ ´), и Unicode-нормализация их не сводит — таблица нужна явная.
 */
const APOSTROPHES = /[ʻʼ‘’´'`]/g;

/**
 * Служебные слова, которые не различают города: «г.», «sh.», «shahri».
 * Отдельными токенами — иначе `\bg\b` съело бы «g» внутри слова, а «город»
 * не отличилось бы от «Городище».
 *
 * «tumani»/«туман»/«район» здесь же: «Urgut tumani» и «Ургут» — одно место.
 */
const CITY_NOISE = new Set([
  'g', 'г', 'gor', 'город', 'sh', 'shahri', 'shahar', 'city',
  'tumani', 'tuman', 'туман', 'район', 'r', 'н',
]);

function simplify(raw: string): string {
  return raw
    .toLowerCase()
    .replace(APOSTROPHES, '')
    .split(/[^a-zа-яёЀ-ӿ0-9]+/)
    .filter((token) => token.length > 0 && !CITY_NOISE.has(token))
    .join('');
}

/**
 * Город → slug. null, если написание неизвестно: выдумывать город опаснее,
 * чем честно сказать «не знаю» и оставить клиента вне городского фильтра.
 */
export function normalizeCity(raw: string | null | undefined): CitySlug | null {
  if (!raw) return null;
  const key = simplify(raw);
  if (!key) return null;
  if ((CITY_SLUGS as readonly string[]).includes(key)) return key as CitySlug;
  return CITY_ALIASES[key] ?? null;
}

/**
 * Все сырые написания города, встречающиеся в базе, — для `where.city.in`.
 * Prisma сравнивает строки как есть, поэтому фильтр по городу разворачивается
 * в перечисление написаний, а не в одно значение.
 */
export function citySpellings(slug: CitySlug): string[] {
  const spellings = Object.entries(CITY_ALIASES)
    .filter(([, value]) => value === slug)
    .map(([key]) => key);
  return Array.from(new Set([slug, ...spellings]));
}

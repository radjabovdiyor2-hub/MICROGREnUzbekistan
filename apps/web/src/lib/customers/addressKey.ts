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
 */
const CITY_NOISE = new Set(['g', 'г', 'gor', 'город', 'sh', 'shahri', 'shahar', 'city']);

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

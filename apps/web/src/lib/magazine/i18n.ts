// ════════════════════════════════════════════════════════════
// FRESH WEEKLY — двуязычность (uz / ru).
// Журнал печатается на двух языках сразу: узбекский — основной кегль,
// русский — мельче под ним (см. .mag-lang-sec в magazine-print.css).
//
// Ключевое: L10n = string | {uz,ru}. Простая строка трактуется как
// русский, поэтому весь существующий контент (сиды, defaults, спеки в БД)
// продолжает работать без изменений.
// ════════════════════════════════════════════════════════════

import type { Lang, L10n } from './types';
export type { Lang, L10n };

/** Порядок = порядок показа на полосе: сначала узбекский, затем русский. */
export const LANGS: Lang[] = ['uz', 'ru'];

/** Достать текст на нужном языке с фолбэком: запрошенный → uz → ru → первый доступный. */
export function t(v: L10n | undefined | null, lang: Lang = 'uz'): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  const direct = v[lang];
  if (direct) return direct;
  if (v.uz) return v.uz;
  if (v.ru) return v.ru;
  return '';
}

/**
 * Все языковые варианты для одновременного показа.
 * Возвращает только реально заполненные, без дублей.
 */
export function tri(v: L10n | undefined | null): { lang: Lang; text: string }[] {
  if (v == null) return [];
  if (typeof v === 'string') return v ? [{ lang: 'ru', text: v }] : [];
  const out: { lang: Lang; text: string }[] = [];
  const seen = new Set<string>();
  for (const lang of LANGS) {
    const text = v[lang];
    if (text && !seen.has(text)) {
      seen.add(text);
      out.push({ lang, text });
    }
  }
  return out;
}

/** Собрать подписи двух языков в одну строку: «Nima buyurtma qilish · Что заказать». */
export function inline(key: UIKey, sep = ' · '): string {
  const seen = new Set<string>();
  return LANGS
    .map((l) => UI[l][key])
    .filter((s) => s && !seen.has(s) && seen.add(s))
    .join(sep);
}

// ── Словарь интерфейсных подписей журнала ──
const RU = {
  contents: 'Содержание',
  editorial: 'От редакции',
  chefWord: 'Слово шефа',
  restaurantOfWeek: 'Ресторан недели',
  whatToOrder: 'Что заказать',
  ourRating: 'Наш рейтинг',
  healthBeauty: 'Здоровье и красота',
  healthBeautyTitle: 'Здоровье и красота недели',
  googleTrend: 'Тренд Google на этой неделе',
  factOfWeek: 'Факт недели',
  microgreenAdvice: 'Совет с микрозеленью',
  recipeOfWeek: 'Рецепт недели',
  chefVersion: 'Версия шефа',
  homeVersion: 'Версия для дома',
  kitchenTips: 'Советы кухни',
  nutritionist: 'Нутрициолог',
  product: 'Продукт',
  per100: 'на 100г',
  vsLemon: 'vs лимон',
  hostessLifehack: 'Лайфхак для хозяйки',
  whatToDo: 'Что делать',
  forFamily: 'Для всей семьи',
  farmStory: 'История нашей фермы',
  discountFrom: 'Скидка',
  promoCode: 'Промокод',
  issue: 'Выпуск',
  online: 'онлайн',
  inMagazine: 'в журнале',
} as const;

export type UIKey = keyof typeof RU;

const UZ: Record<UIKey, string> = {
  contents: 'Mundarija',
  editorial: 'Tahririyatdan',
  chefWord: 'Oshpaz so‘zi',
  restaurantOfWeek: 'Hafta restorani',
  whatToOrder: 'Nima buyurtma qilish',
  ourRating: 'Bizning bahomiz',
  healthBeauty: 'Salomatlik va go‘zallik',
  healthBeautyTitle: 'Hafta salomatligi va go‘zalligi',
  googleTrend: 'Shu haftaning Google trendi',
  factOfWeek: 'Hafta fakti',
  microgreenAdvice: 'Mikrozelen bilan maslahat',
  recipeOfWeek: 'Hafta retsepti',
  chefVersion: 'Oshpaz varianti',
  homeVersion: 'Uy uchun variant',
  kitchenTips: 'Oshxona maslahatlari',
  nutritionist: 'Nutritsiolog',
  product: 'Mahsulot',
  per100: '100g uchun',
  vsLemon: 'limonga nisbatan',
  hostessLifehack: 'Bekalar uchun maslahat',
  whatToDo: 'Nima qilish kerak',
  forFamily: 'Butun oila uchun',
  farmStory: 'Fermamiz tarixi',
  discountFrom: 'Chegirma',
  promoCode: 'Promokod',
  issue: 'Son',
  online: 'onlayn',
  inMagazine: 'jurnalda',
};

export const UI: Record<Lang, Record<UIKey, string>> = { uz: UZ, ru: RU };

// ── Названия секций (для содержания) на двух языках ──
import type { BlockType, Audience } from './types';

export const SECTION_TITLES_I18N: Record<Lang, Record<BlockType, string>> = {
  uz: {
    cover: 'Muqova', toc: 'Mundarija', chefWord: 'Oshpaz so‘zi', restaurantOfWeek: 'Hafta restorani',
    healthTrends: 'Salomatlik va go‘zallik', recipe: 'Hafta retsepti',
    familyConversion: 'Butun oila uchun',
  },
  ru: {
    cover: 'Обложка', toc: 'Содержание', chefWord: 'Слово шефа', restaurantOfWeek: 'Ресторан недели',
    healthTrends: 'Здоровье и красота', recipe: 'Рецепт недели',
    familyConversion: 'Для всей семьи',
  },
};

export const AUDIENCE_LABELS_I18N: Record<Lang, Record<Audience, string>> = {
  uz: { all: 'Hamma uchun', men: 'Erkaklar uchun', women: 'Ayollar uchun', family: 'Oila uchun' },
  ru: { all: 'Для всех', men: 'Для мужчин', women: 'Для женщин', family: 'Для всей семьи' },
};

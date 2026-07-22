// ════════════════════════════════════════════════════════════
// FRESH WEEKLY — двуязычность (uz / ru).
// Журнал печатается на двух языках сразу: узбекский — основной кегль,
// русский — мельче под ним (см. .mag-lang-sec в magazine-print.css).
//
// Ключевое: L10n = string | {uz,ru}. Простая строка трактуется как
// русский, поэтому весь существующий контент (сиды, defaults, спеки в БД)
// продолжает работать без изменений.
// ════════════════════════════════════════════════════════════

export type Lang = 'uz' | 'ru';

/** Порядок = порядок показа на полосе: сначала узбекский, затем русский. */
export const LANGS: Lang[] = ['uz', 'ru'];

/** Локализуемый текст: либо просто строка (= русский), либо словарь по языкам. */
export type L10n = string | Partial<Record<Lang, string>>;

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
  kids: 'Fresh Kids',
  kidsEco: 'Fresh Kids · Экосистема',
  nineGames: '9 игр',
  whatToDo: 'Что делать',
  neuroTale: 'Нейро-сказка',
  voiceRiddle: 'Голосовая загадка',
  answerBot: 'Ответь голосом боту',
  playOnline: 'Играй онлайн · 9 механик',
  kidsQrText: 'Сканируй QR: нейро-сказка с твоим именем, голосовые загадки, AR-раскраски и паспорт агронома.',
  forFamily: 'Для всей семьи',
  farmStory: 'История нашей фермы',
  discountFrom: 'Скидка',
  promoCode: 'Промокод',
  collectionAR: 'Коллекция + AR',
  card: 'Карточка',
  liveIn3D: 'Оживи в 3D',
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
  kids: 'Fresh Kids',
  kidsEco: 'Fresh Kids · Ekotizim',
  nineGames: '9 o‘yin',
  whatToDo: 'Nima qilish kerak',
  neuroTale: 'Neyro-ertak',
  voiceRiddle: 'Ovozli topishmoq',
  answerBot: 'Botga ovoz bilan javob ber',
  playOnline: 'Onlayn o‘yna · 9 mexanika',
  kidsQrText: 'QR’ni skanerlang: ismingiz bilan ertak, ovozli topishmoqlar, AR-bo‘yash va agronom pasporti.',
  forFamily: 'Butun oila uchun',
  farmStory: 'Fermamiz tarixi',
  discountFrom: 'Chegirma',
  promoCode: 'Promokod',
  collectionAR: 'Kolleksiya + AR',
  card: 'Kartochka',
  liveIn3D: '3D’da jonlantir',
  issue: 'Son',
  online: 'onlayn',
  inMagazine: 'jurnalda',
};

export const UI: Record<Lang, Record<UIKey, string>> = { uz: UZ, ru: RU };

// ── Названия секций (для содержания) на двух языках ──
import type { BlockType, Audience, KidsMechanic } from './types';

export const SECTION_TITLES_I18N: Record<Lang, Record<BlockType, string>> = {
  uz: {
    cover: 'Muqova', toc: 'Mundarija', chefWord: 'Oshpaz so‘zi', restaurantOfWeek: 'Hafta restorani',
    healthTrends: 'Salomatlik va go‘zallik', recipe: 'Hafta retsepti', kitchenLifehacks: 'Oshxona maslahatlari',
    nutritionist: 'Nutritsiolog', kids: 'Fresh Kids', kidsCatalog: 'Bolalar ekotizimi · 9 o‘yin',
    familyConversion: 'Butun oila uchun', collectionAR: 'Kolleksiya + AR',
  },
  ru: {
    cover: 'Обложка', toc: 'Содержание', chefWord: 'Слово шефа', restaurantOfWeek: 'Ресторан недели',
    healthTrends: 'Здоровье и красота', recipe: 'Рецепт недели', kitchenLifehacks: 'Советы кухни',
    nutritionist: 'Нутрициолог', kids: 'Fresh Kids', kidsCatalog: 'Детская экосистема · 9 игр',
    familyConversion: 'Для всей семьи', collectionAR: 'Коллекция + AR',
  },
};

export const AUDIENCE_LABELS_I18N: Record<Lang, Record<Audience, string>> = {
  uz: { all: 'Hamma uchun', men: 'Erkaklar uchun', women: 'Ayollar uchun', kids: 'Bolalar uchun', family: 'Oila uchun' },
  ru: { all: 'Для всех', men: 'Для мужчин', women: 'Для женщин', kids: 'Для детей', family: 'Для всей семьи' },
};

export const KIDS_MECHANIC_LABELS_I18N: Record<Lang, Record<KidsMechanic, string>> = {
  uz: {
    ar_coloring: 'AR-bo‘yash', food_art: 'Food-art konstruktor', plant_quest: '«Ek va Ye» kvesti',
  },
  ru: {
    ar_coloring: 'AR-раскраска', food_art: 'Фуд-арт конструктор', plant_quest: 'Квест «Посади и Съешь»',
  },
};

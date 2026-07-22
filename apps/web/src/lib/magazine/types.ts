// ════════════════════════════════════════════════════════════
// FRESH WEEKLY: HoReCa Edition — схема контента (конструктор)
// Каждый блок — «слот», куда владелец вставляет текст (свой/от ИИ).
//  · audience — аудиторная навигация (Мужчины/Женщины/Дети/Семья)
//  · origin   — схема 50/50 (shared = общий выпуск, personal = ресторан)
// ════════════════════════════════════════════════════════════

import type { L10n } from './i18n';
export type { L10n };

export type Audience = 'all' | 'men' | 'women' | 'kids' | 'family';
export type Origin = 'shared' | 'personal';

export const AUDIENCE_LABELS: Record<Audience, string> = {
  all: 'Для всех',
  men: 'Для мужчин',
  women: 'Для женщин',
  kids: 'Для детей',
  family: 'Для всей семьи',
};

// 3 детские механики
export type KidsMechanic =
  | 'ar_coloring'      // Живые AR-раскраски
  | 'food_art'         // Фуд-арт конструктор
  | 'plant_quest';     // Квест «Посади и Съешь»

export const KIDS_MECHANIC_LABELS: Record<KidsMechanic, string> = {
  ar_coloring: 'AR-раскраска',
  food_art: 'Фуд-арт конструктор',
  plant_quest: 'Квест «Посади и Съешь»',
};

export const KIDS_MECHANIC_ORDER: KidsMechanic[] = [
  'food_art', 'plant_quest', 'ar_coloring',
];

// Детская механика недели: циклично по номеру выпуска
export function mechanicForWeek(weekNumber: number): KidsMechanic {
  const i = ((weekNumber - 1) % KIDS_MECHANIC_ORDER.length + KIDS_MECHANIC_ORDER.length) % KIDS_MECHANIC_ORDER.length;
  return KIDS_MECHANIC_ORDER[i];
}

// ── Базовые поля любого блока ──
interface BlockBase {
  id: string;
  audience: Audience;
  origin: Origin;
}

// ── Обложка ──
export interface CoverBlock extends BlockBase {
  type: 'cover';
  title: L10n;
  accentTitle?: L10n; // цветная часть заголовка
  subtitle?: L10n;
  background?: string;   // URL фонового фото
  tags?: string[];
}

// ── Содержание (редакционная колонка; список пунктов авто) ──
export interface TocBlock extends BlockBase {
  type: 'toc';
  editorialNote?: L10n;
}

// ── Слово шефа (персональное) ──
export interface ChefWordBlock extends BlockBase {
  type: 'chefWord';
  chefName?: L10n;
  portrait?: string;
  text: L10n;
}

// ── Ресторан недели ──
export interface RestaurantOfWeekBlock extends BlockBase {
  type: 'restaurantOfWeek';
  heroImage?: string;
  name: L10n;
  meta?: L10n;
  pullQuote?: L10n;
  quoteAttr?: L10n;
  interview?: { q: L10n; a: L10n }[];
  whatToOrder?: L10n;
  rating?: L10n;
}

// ── Здоровье и красота: темы недели по трендам Google (склейка health+beauty) ──
export interface TrendAnalyticsBlock extends BlockBase {
  type: 'healthTrends';
  title?: L10n;
  items: {
    trendQuery?: L10n;   // что чаще гуглят на этой неделе
    factTitle?: L10n;
    fact: L10n;
    advice?: L10n;       // нативный совет по питанию/микрозелени
    image?: string;
    caption?: L10n;
  }[];
}

// ── Рецепт недели (шеф/дом) ──
export interface RecipeBlock extends BlockBase {
  type: 'recipe';
  heroImage?: string;
  title: L10n;
  subtitle?: L10n;
  chefVersion?: L10n;
  homeVersion?: L10n;
  caption?: L10n;
  steps?: { title: L10n; text: L10n; image?: string }[];
}

// ── Детский блок (одна из 9 механик) ──
export interface KidsBlock extends BlockBase {
  type: 'kids';
  mechanic: KidsMechanic;
  title: L10n;
  image?: string;          // иллюстрация механики (раскраска/фуд-арт)
  caption?: L10n;
  instruction?: L10n;    // инструкция механики / food-art
  riddle?: L10n;         // голосовая загадка
  tale?: L10n;           // нейро-сказка (с именем ребёнка)
  botLink?: string;        // ссылка на Telegram-бота (хруст/загадки)
}

// ── Семейный блок: конверсия в продажи (персональный) ──
export interface FamilyConversionBlock extends BlockBase {
  type: 'familyConversion';
  farmStory?: L10n;
  farmImage?: string;
  caption?: L10n;
  promoText?: L10n;      // «Скидка N% от ресторана …»
  // promoCode/qr берутся из профиля ресторана при рендере
}

// ── Коллекционная карточка + AR ──
export interface CollectionArBlock extends BlockBase {
  type: 'collectionAR';
  cardName: L10n;
  cardText?: L10n;
  cardImage?: string;
  arUrl?: string;          // по умолчанию /magazine/ar
}

export type Block =
  | CoverBlock
  | TocBlock
  | ChefWordBlock
  | RestaurantOfWeekBlock
  | TrendAnalyticsBlock
  | RecipeBlock
  | KidsBlock
  | FamilyConversionBlock
  | CollectionArBlock;

export type BlockType = Block['type'];

export interface MagazineSpec {
  blocks: Block[];
}

// Бренд ресторана (из модели Restaurant) для персонализации рендера
export interface RestaurantBrand {
  name: string;
  slug: string;
  logo?: string | null;
  instagram?: string | null;
  brandPrimary?: string | null;
  brandAccent?: string | null;
  promoCode?: string | null;
  promoDiscount?: number | null;
  menuItems?: string[];
}

// Каноничный порядок страниц финального журнала (независимо от источника блока)
export const SECTION_ORDER: BlockType[] = [
  'cover',
  'toc',
  'chefWord',
  'restaurantOfWeek',
  'healthTrends',
  'recipe',
  'kids',
  'familyConversion',
  'collectionAR',
];

// Сборка финального журнала: общий 50% + персональный 50% → упорядоченный список.
// Персональные блоки перекрывают общие того же типа.
export function composeMagazine(shared: MagazineSpec | null, personal: MagazineSpec | null): Block[] {
  const sharedBlocks = shared?.blocks ?? [];
  const personalBlocks = personal?.blocks ?? [];
  const personalTypes = new Set(personalBlocks.map((b) => b.type));
  const merged = [
    ...sharedBlocks.filter((b) => !personalTypes.has(b.type)),
    ...personalBlocks,
  ];
  const rank = (t: BlockType) => {
    const i = SECTION_ORDER.indexOf(t);
    return i === -1 ? SECTION_ORDER.length : i;
  };
  return merged
    .map((b, i) => ({ b, i }))
    .sort((x, y) => rank(x.b.type) - rank(y.b.type) || x.i - y.i)
    .map(({ b }) => b);
}

export const SECTION_TITLES: Record<BlockType, string> = {
  cover: 'Обложка',
  toc: 'Содержание',
  chefWord: 'Слово шефа',
  restaurantOfWeek: 'Ресторан недели',
  healthTrends: 'Здоровье и красота',
  recipe: 'Рецепт недели',
  kids: 'Fresh Kids',
  familyConversion: 'Для всей семьи',
  collectionAR: 'Коллекция + AR',
};

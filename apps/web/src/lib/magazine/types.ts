// ════════════════════════════════════════════════════════════
// FRESH WEEKLY: HoReCa Edition — схема контента (конструктор)
// Каждый блок — «слот», куда владелец вставляет текст (свой/от ИИ).
//  · audience — аудиторная навигация (Мужчины/Женщины/Дети/Семья)
//  · origin   — схема 50/50 (shared = общий выпуск, personal = ресторан)
// ════════════════════════════════════════════════════════════

export type Audience = 'all' | 'men' | 'women' | 'kids' | 'family';
export type Origin = 'shared' | 'personal';

export const AUDIENCE_LABELS: Record<Audience, string> = {
  all: 'Для всех',
  men: 'Для мужчин',
  women: 'Для женщин',
  kids: 'Для детей',
  family: 'Для всей семьи',
};

// 9 детских механик (циклично по выпускам)
export type KidsMechanic =
  | 'ar_coloring'      // Живые AR-раскраски
  | 'speech_ar'        // Логопедические AR-карточки
  | 'food_art'         // Фуд-арт конструктор
  | 'asmr_crunch'      // ASMR «Хруст-Челлендж»
  | 'plant_quest'      // Квест «Посади и Съешь»
  | 'board_game'       // Настолка «Путь Росточка»
  | 'voice_riddle'     // Голосовые загадки с ИИ-Агрономом
  | 'neuro_tale'       // Нейро-Сказка с именем ребёнка
  | 'agronom_passport'; // Паспорт «Юного Агронома»

export const KIDS_MECHANIC_LABELS: Record<KidsMechanic, string> = {
  ar_coloring: 'AR-раскраска',
  speech_ar: 'Логопед AR-карточки',
  food_art: 'Фуд-арт конструктор',
  asmr_crunch: 'ASMR Хруст-Челлендж',
  plant_quest: 'Квест «Посади и Съешь»',
  board_game: 'Настолка «Путь Росточка»',
  voice_riddle: 'Голосовые загадки',
  neuro_tale: 'Нейро-Сказка с именем',
  agronom_passport: 'Паспорт Юного Агронома',
};

export const KIDS_MECHANIC_ORDER: KidsMechanic[] = [
  'ar_coloring', 'speech_ar', 'food_art', 'asmr_crunch', 'plant_quest',
  'board_game', 'voice_riddle', 'neuro_tale', 'agronom_passport',
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
  title: string;
  accentTitle?: string; // цветная часть заголовка
  subtitle?: string;
  background?: string;   // URL фонового фото
  tags?: string[];
}

// ── Содержание (редакционная колонка; список пунктов авто) ──
export interface TocBlock extends BlockBase {
  type: 'toc';
  editorialNote?: string;
}

// ── Слово шефа (персональное) ──
export interface ChefWordBlock extends BlockBase {
  type: 'chefWord';
  chefName?: string;
  portrait?: string;
  text: string;
}

// ── Ресторан недели ──
export interface RestaurantOfWeekBlock extends BlockBase {
  type: 'restaurantOfWeek';
  heroImage?: string;
  name: string;
  meta?: string;
  pullQuote?: string;
  quoteAttr?: string;
  interview?: { q: string; a: string }[];
  whatToOrder?: string;
  rating?: string;
}

// ── Новости Узб и мира (мужской блок) ──
export interface NewsDigestBlock extends BlockBase {
  type: 'newsDigest';
  title?: string;
  items: { title: string; text: string }[];
}

// ── AI-аналитика трендов (Google Trends): здоровье / бьюти ──
export interface TrendAnalyticsBlock extends BlockBase {
  type: 'healthTrends' | 'beautyTrends';
  trendQuery?: string;   // что чаще гуглят на этой неделе
  factTitle?: string;
  fact: string;
  advice?: string;       // нативный совет по питанию/микрозелени
}

// ── Рецепт недели (шеф/дом) ──
export interface RecipeBlock extends BlockBase {
  type: 'recipe';
  heroImage?: string;
  title: string;
  subtitle?: string;
  chefVersion?: string;
  homeVersion?: string;
  steps?: { title: string; text: string }[];
}

// ── Кухонные лайфхаки / выпечка ──
export interface ListBlock extends BlockBase {
  type: 'kitchenLifehacks' | 'bakingDesserts';
  title: string;
  intro?: string;
  items: { title: string; text: string }[];
}

// ── Нутрициолог ──
export interface NutritionistBlock extends BlockBase {
  type: 'nutritionist';
  title: string;
  fact?: string;
  tableTitle?: string;
  table?: { rank: string; product: string; per100: string; vs: string }[];
  quote?: string;
  quoteAttr?: string;
  lifehack?: string;
}

// ── Tech-дайджест ──
export interface TechDigestBlock extends BlockBase {
  type: 'techDigest';
  title?: string;
  entries: { icon?: string; kicker: string; name: string; text: string }[];
  aiHack?: string;
}

// ── Фитнес (мужской блок) ──
export interface FitnessBlock extends BlockBase {
  type: 'fitness';
  title: string;
  intro?: string;
  exercises?: { name: string; text: string }[];
}

// ── Детский блок (одна из 9 механик) ──
export interface KidsBlock extends BlockBase {
  type: 'kids';
  mechanic: KidsMechanic;
  title: string;
  instruction?: string;    // инструкция механики / food-art
  riddle?: string;         // голосовая загадка
  tale?: string;           // нейро-сказка (с именем ребёнка)
  botLink?: string;        // ссылка на Telegram-бота (хруст/загадки)
}

// ── Детская экосистема: каталог всех 9 механик (одна страница) ──
export interface KidsCatalogBlock extends BlockBase {
  type: 'kidsCatalog';
  title?: string;
  intro?: string;
}

// ── Семейный блок: конверсия в продажи (персональный) ──
export interface FamilyConversionBlock extends BlockBase {
  type: 'familyConversion';
  farmStory?: string;
  promoText?: string;      // «Скидка N% от ресторана …»
  // promoCode/qr берутся из профиля ресторана при рендере
}

// ── Коллекционная карточка + AR ──
export interface CollectionArBlock extends BlockBase {
  type: 'collectionAR';
  cardName: string;
  cardText?: string;
  arUrl?: string;          // по умолчанию /magazine/ar
}

export type Block =
  | CoverBlock
  | TocBlock
  | ChefWordBlock
  | RestaurantOfWeekBlock
  | NewsDigestBlock
  | TrendAnalyticsBlock
  | RecipeBlock
  | ListBlock
  | NutritionistBlock
  | TechDigestBlock
  | FitnessBlock
  | KidsBlock
  | KidsCatalogBlock
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
  'newsDigest',
  'healthTrends',
  'fitness',
  'recipe',
  'kitchenLifehacks',
  'bakingDesserts',
  'beautyTrends',
  'nutritionist',
  'techDigest',
  'kids',
  'kidsCatalog',
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
  newsDigest: 'Новости Узб и мира',
  healthTrends: 'AI-аналитика здоровья',
  beautyTrends: 'AI-бьюти тренды',
  recipe: 'Рецепт недели',
  kitchenLifehacks: 'Кухонные лайфхаки',
  bakingDesserts: 'Выпечка и десерты',
  nutritionist: 'Нутрициолог',
  techDigest: 'Tech-дайджест',
  fitness: 'Спорт & Фитнес',
  kids: 'Fresh Kids',
  kidsCatalog: 'Детская экосистема · 9 игр',
  familyConversion: 'Для всей семьи',
  collectionAR: 'Коллекция + AR',
};

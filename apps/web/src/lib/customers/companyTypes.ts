// ══════════════════════════════════════════════════════════════════════
// Тип заведения и его аудитория: slug ↔ отображаемое имя.
//
// В базе `customers.company_type` хранится ЛАТИНСКИЙ SLUG — по той же
// причине, что и район в соседнем файле: перевод приклеивается на границе
// с интерфейсом, а не растекается по колонке в трёх написаниях.
//
// До этого справочника колонка существовала, но всегда содержала строку
// "restaurant": все четыре сборщика в `apps/tgas/shared/lead_gen.py`
// проставляли её константой независимо от того, что искали. Фитнес-клуб,
// собранный ночной задачей, лежал в базе рестораном.
//
// Зеркало этих слагов — `VENUE_QUERIES` в `lead_gen.py`: там к каждому
// из них привязаны поисковые запросы. Между модулями нет прямых импортов
// (см. CLAUDE.md), поэтому список дублируется осознанно, а расхождение
// ловит тест `companyTypes.test.ts`.
// ══════════════════════════════════════════════════════════════════════

/** Группы для лент чипов: три вопроса к территории, а не один длинный список. */
export const COMPANY_TYPE_GROUPS = ['horeca', 'health', 'retail'] as const;
export type CompanyTypeGroup = (typeof COMPANY_TYPE_GROUPS)[number];

export const GROUP_META: Record<CompanyTypeGroup, { ru: string; uz: string }> = {
  horeca: { ru: 'Кухня', uz: 'Oshxona' },
  health: { ru: 'Здоровье и спорт', uz: 'Salomatlik va sport' },
  retail: { ru: 'Розница и прочее', uz: 'Chakana va boshqa' },
};

export interface CompanyTypeMeta {
  ru: string;
  uz: string;
  group: CompanyTypeGroup;
}

export const COMPANY_TYPES: Record<string, CompanyTypeMeta> = {
  // ── Кухня: прямая цель микрозелени ──
  restaurant: { ru: 'Ресторан', uz: 'Restoran', group: 'horeca' },
  cafe: { ru: 'Кафе', uz: 'Kafe', group: 'horeca' },
  toyxona: { ru: 'Свадебный ресторан', uz: 'Toʻyxona', group: 'horeca' },
  banquet: { ru: 'Банкетный зал', uz: 'Banket zali', group: 'horeca' },
  chaikhana: { ru: 'Чайхана', uz: 'Choyxona', group: 'horeca' },
  canteen: { ru: 'Столовая', uz: 'Oshxona', group: 'horeca' },
  fastfood: { ru: 'Фастфуд', uz: 'Tez taomlar', group: 'horeca' },
  coffee: { ru: 'Кофейня', uz: 'Qahvaxona', group: 'horeca' },
  bakery: { ru: 'Пекарня и кондитерская', uz: 'Nonvoyxona va qandolatxona', group: 'horeca' },
  hotel: { ru: 'Отель', uz: 'Mehmonxona', group: 'horeca' },
  catering: { ru: 'Кейтеринг', uz: 'Ketering', group: 'horeca' },

  // ── Здоровье и спорт ──
  fitness: { ru: 'Фитнес-клуб', uz: 'Fitnes klub', group: 'health' },
  sport: { ru: 'Спорткомплекс', uz: 'Sport majmuasi', group: 'health' },
  sanatorium: { ru: 'Санаторий', uz: 'Sanatoriy', group: 'health' },
  clinic: { ru: 'Клиника', uz: 'Klinika', group: 'health' },

  // ── Розница и прочее ──
  supermarket: { ru: 'Супермаркет', uz: 'Supermarket', group: 'retail' },
  school: { ru: 'Учебное заведение', uz: 'Taʼlim muassasasi', group: 'retail' },
  office: { ru: 'Офис', uz: 'Ofis', group: 'retail' },
  other: { ru: 'Прочее', uz: 'Boshqa', group: 'retail' },
};

export type CompanyTypeSlug = keyof typeof COMPANY_TYPES;

/**
 * Категории, у которых пол аудитории — рабочий вопрос, а не формальность.
 *
 * Лента «женский / мужской» показывается только для них: висеть постоянно
 * ей незачем — у пекарни этот признак не спрашивают.
 */
export const AUDIENCE_RELEVANT: readonly string[] = ['fitness', 'sport', 'toyxona'];

export const AUDIENCES = ['female', 'male', 'mixed'] as const;
export type Audience = (typeof AUDIENCES)[number];

export const AUDIENCE_META: Record<Audience, { ru: string; uz: string }> = {
  female: { ru: 'Женский', uz: 'Ayollar' },
  male: { ru: 'Мужской', uz: 'Erkaklar' },
  mixed: { ru: 'Смешанный', uz: 'Aralash' },
};

// ══════════════════════════════════════════════════════════════════════
// Цветовые корзины для раскраски карты
//
// Категорий девятнадцать, а различимых цветов на карте — восемь, дальше
// читатель перестаёт отличать оттенки друг от друга (и токенов в системе
// всего двенадцать, часть из которых занята состояниями). Поэтому цвет
// отвечает не за категорию, а за КОРЗИНУ: «кофейня» и «пекарня» красятся
// одинаково, потому что решение по ним одно и то же — утренняя выпечка и
// напитки. Точный тип остаётся в фильтре и в попапе точки, где он не
// конкурирует за различимость с восемнадцатью соседями.
// ══════════════════════════════════════════════════════════════════════

export const COLOR_BUCKETS = [
  'restaurant',
  'cafe',
  'toyxona',
  'fitness',
  'hotel',
  'bakery',
  'canteen',
  'other',
] as const;
export type ColorBucket = (typeof COLOR_BUCKETS)[number];

export const BUCKET_META: Record<ColorBucket, { ru: string; uz: string; token: string }> = {
  restaurant: { ru: 'Рестораны', uz: 'Restoranlar', token: 'cat1' },
  cafe: { ru: 'Кафе', uz: 'Kafelar', token: 'cat2' },
  toyxona: { ru: 'Тойхоны и банкеты', uz: 'Toʻyxona va banket', token: 'cat3' },
  fitness: { ru: 'Фитнес и спорт', uz: 'Fitnes va sport', token: 'cat4' },
  hotel: { ru: 'Отели и санатории', uz: 'Mehmonxona va sanatoriy', token: 'cat5' },
  bakery: { ru: 'Выпечка и кофе', uz: 'Nonvoyxona va qahva', token: 'cat7' },
  canteen: { ru: 'Столовые и чайханы', uz: 'Oshxona va choyxona', token: 'cat9' },
  other: { ru: 'Прочее', uz: 'Boshqa', token: 'muted' },
};

const BUCKET_OF: Record<string, ColorBucket> = {
  restaurant: 'restaurant',
  cafe: 'cafe',
  toyxona: 'toyxona',
  banquet: 'toyxona',
  fitness: 'fitness',
  sport: 'fitness',
  hotel: 'hotel',
  sanatorium: 'hotel',
  bakery: 'bakery',
  coffee: 'bakery',
  canteen: 'canteen',
  chaikhana: 'canteen',
  fastfood: 'canteen',
  catering: 'canteen',
  clinic: 'other',
  supermarket: 'other',
  school: 'other',
  office: 'other',
  other: 'other',
};

/**
 * Корзина, в которой красится тип заведения. Неизвестный тип — «прочее».
 *
 * Обращение идёт через `Object.hasOwn`, а не индексом: у обычного объекта
 * есть унаследованные `constructor` и `toString`, и `BUCKET_OF['constructor']`
 * вернул бы функцию, а не корзину. Строка приходит из URL-параметра, то
 * есть от кого угодно.
 */
export function bucketOf(slug: string | null | undefined): ColorBucket {
  if (!slug || !Object.hasOwn(BUCKET_OF, slug)) return 'other';
  return BUCKET_OF[slug];
}

/** Пары «тип → корзина» для match-выражения MapLibre. */
export function bucketPairs(): [string, ColorBucket][] {
  return Object.entries(BUCKET_OF) as [string, ColorBucket][];
}

/** Подпись типа на языке интерфейса. Неизвестный slug показываем как есть. */
export function companyTypeLabel(slug: string | null | undefined, lang: 'ru' | 'uz'): string {
  if (!slug) return lang === 'ru' ? 'Тип не указан' : 'Turi koʻrsatilmagan';
  return Object.hasOwn(COMPANY_TYPES, slug) ? COMPANY_TYPES[slug][lang] : slug;
}

/**
 * Подпись аудитории. NULL — это «не выяснено», а не «смешанный»: разница
 * важна, потому что невыясненное продавцу надо выяснить при первом звонке,
 * а смешанное уже выяснено.
 */
export function audienceLabel(slug: string | null | undefined, lang: 'ru' | 'uz'): string {
  if (!slug) return lang === 'ru' ? 'Не выяснено' : 'Aniqlanmagan';
  return isAudience(slug) ? AUDIENCE_META[slug][lang] : slug;
}

/** Типы одной группы — для ленты чипов и выпадающего списка. */
export function typesOfGroup(group: CompanyTypeGroup): { slug: string; meta: CompanyTypeMeta }[] {
  return Object.entries(COMPANY_TYPES)
    .filter(([, meta]) => meta.group === group)
    .map(([slug, meta]) => ({ slug, meta }));
}

/**
 * Известен ли slug справочнику — фильтр не должен принимать произвольную
 * строку.
 *
 * `Object.hasOwn`, а не `in`: оператор `in` видит прототип, и на
 * `?companyType=constructor` из адресной строки отвечал бы «известен».
 * В базу тогда уходило бы `company_type = 'constructor'` — запрос без
 * единой строки, неотличимый от «здесь никого нет».
 */
export function isCompanyType(value: string | null | undefined): value is CompanyTypeSlug {
  return typeof value === 'string' && Object.hasOwn(COMPANY_TYPES, value);
}

export function isAudience(value: string | null | undefined): value is Audience {
  return typeof value === 'string' && (AUDIENCES as readonly string[]).includes(value);
}

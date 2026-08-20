// ══════════════════════════════════════════════════════════════════════
// Районы Ташкента и Самаркандской области: slug ↔ отображаемое имя.
//
// В базе `customers.district` хранится ЛАТИНСКИЙ SLUG, а не «Чиланзар».
// Причина видна в соседней колонке: `customers.city` по умолчанию
// "Samarqand", а `orders.city` — "tashkent", и сравнение городов давно
// приходится делать через список написаний. Повторять этот разнобой в
// новой колонке незачем — район пишется одним способом, а перевод
// приклеивается здесь, на границе с интерфейсом.
//
// Зеркало этого списка — `_DISTRICTS` в `apps/tgas/shared/geo.py`: между
// модулями нет прямых импортов, поэтому геокодер держит свою копию слагов.
// Расхождение двух списков ловит тест `districts.test.ts`.
// ══════════════════════════════════════════════════════════════════════

export interface DistrictMeta {
  ru: string;
  uz: string;
  /** Slug города, к которому относится район. */
  city: CitySlug;
  /**
   * Город это или район области. Разрез по территории читается иначе, когда
   * видно, что Ургут — не квартал Самарканда, а полтора часа езды: цена
   * доставки свежей зелени туда другая.
   */
  scope: 'city' | 'region';
}

export const CITY_SLUGS = ['tashkent', 'samarkand'] as const;
export type CitySlug = (typeof CITY_SLUGS)[number];

export const CITY_META: Record<CitySlug, { ru: string; uz: string }> = {
  tashkent: { ru: 'Ташкент', uz: 'Toshkent' },
  // Не «Самарканд»: с тех пор как справочник накрыл область, под этим
  // фильтром лежат и Ургут, и Каттакурган. Подпись «Самарканд» обещала бы
  // город и делала бы половину точек необъяснимыми.
  samarkand: { ru: 'Самарканд и область', uz: 'Samarqand va viloyat' },
};

export const DISTRICTS: Record<string, DistrictMeta> = {
  // Ташкент — 12 туманов.
  bektemir: { ru: 'Бектемир', uz: 'Bektemir', city: 'tashkent', scope: 'city' },
  chilanzar: { ru: 'Чиланзар', uz: 'Chilonzor', city: 'tashkent', scope: 'city' },
  mirobod: { ru: 'Мирабад', uz: 'Mirobod', city: 'tashkent', scope: 'city' },
  'mirzo-ulugbek': { ru: 'Мирзо-Улугбек', uz: 'Mirzo Ulugʻbek', city: 'tashkent', scope: 'city' },
  olmazor: { ru: 'Алмазар', uz: 'Olmazor', city: 'tashkent', scope: 'city' },
  sergeli: { ru: 'Сергели', uz: 'Sergeli', city: 'tashkent', scope: 'city' },
  shayxontohur: { ru: 'Шайхантахур', uz: 'Shayxontohur', city: 'tashkent', scope: 'city' },
  uchtepa: { ru: 'Учтепа', uz: 'Uchtepa', city: 'tashkent', scope: 'city' },
  yakkasaroy: { ru: 'Яккасарай', uz: 'Yakkasaroy', city: 'tashkent', scope: 'city' },
  yangihayot: { ru: 'Янгихаёт', uz: 'Yangihayot', city: 'tashkent', scope: 'city' },
  yashnobod: { ru: 'Яшнабад', uz: 'Yashnobod', city: 'tashkent', scope: 'city' },
  yunusobod: { ru: 'Юнусабад', uz: 'Yunusobod', city: 'tashkent', scope: 'city' },

  // Самарканд — два городских района.
  siyob: { ru: 'Сиаб', uz: 'Siyob', city: 'samarkand', scope: 'city' },
  temiryol: { ru: 'Темирйул', uz: 'Temiryoʻl', city: 'samarkand', scope: 'city' },

  // Самаркандская область — 14 туманов. Заведены потому, что большая часть
  // тойхон стоит на выездах из города, а не внутри двух городских районов:
  // без этих слагов они все приходили с `district = null` и в разрезе
  // «где недобираем» не существовали.
  bulungur: { ru: 'Булунгур', uz: 'Bulungʻur', city: 'samarkand', scope: 'region' },
  ishtixon: { ru: 'Иштыхан', uz: 'Ishtixon', city: 'samarkand', scope: 'region' },
  jomboy: { ru: 'Джамбай', uz: 'Jomboy', city: 'samarkand', scope: 'region' },
  kattaqorgon: { ru: 'Каттакурган', uz: 'Kattaqoʻrgʻon', city: 'samarkand', scope: 'region' },
  qoshrabot: { ru: 'Кушработ', uz: 'Qoʻshrabot', city: 'samarkand', scope: 'region' },
  narpay: { ru: 'Нарпай', uz: 'Narpay', city: 'samarkand', scope: 'region' },
  nurobod: { ru: 'Нурабад', uz: 'Nurobod', city: 'samarkand', scope: 'region' },
  oqdaryo: { ru: 'Акдарья', uz: 'Oqdaryo', city: 'samarkand', scope: 'region' },
  pastdargom: { ru: 'Пастдаргом', uz: 'Pastdargʻom', city: 'samarkand', scope: 'region' },
  paxtachi: { ru: 'Пахтачи', uz: 'Paxtachi', city: 'samarkand', scope: 'region' },
  payariq: { ru: 'Пайарык', uz: 'Payariq', city: 'samarkand', scope: 'region' },
  'samarqand-tumani': { ru: 'Самаркандский район', uz: 'Samarqand tumani', city: 'samarkand', scope: 'region' },
  toyloq: { ru: 'Тайлак', uz: 'Toyloq', city: 'samarkand', scope: 'region' },
  urgut: { ru: 'Ургут', uz: 'Urgut', city: 'samarkand', scope: 'region' },
};

export type DistrictSlug = keyof typeof DISTRICTS;

/**
 * Известен ли slug справочнику районов.
 *
 * Фильтр не должен принимать произвольную строку из адресной строки — тот же
 * довод, что у `isCompanyType`. `Object.hasOwn`, а не `in`: оператор `in`
 * видит прототип и отвечает «известен» на `constructor`.
 */
export function isDistrict(value: string | null | undefined): value is DistrictSlug {
  return typeof value === 'string' && Object.hasOwn(DISTRICTS, value);
}

/**
 * Подпись района на языке интерфейса. Неизвестный slug показываем как есть.
 *
 * `Object.hasOwn`, а не индекс: slug приходит из URL-параметра, а у
 * обычного объекта есть унаследованные `constructor` и `toString` —
 * `DISTRICTS['toString']` вернул бы функцию, и `meta[lang]` дал бы
 * undefined прямо в разметку.
 */
export function districtLabel(slug: string | null, lang: 'ru' | 'uz'): string {
  if (!slug) return lang === 'ru' ? 'Район не определён' : 'Tuman aniqlanmagan';
  return Object.hasOwn(DISTRICTS, slug) ? DISTRICTS[slug][lang] : slug;
}

/** Районы одного города — для выпадающего фильтра. Город идёт перед областью. */
export function districtsOfCity(city: CitySlug): { slug: string; meta: DistrictMeta }[] {
  return Object.entries(DISTRICTS)
    .filter(([, meta]) => meta.city === city)
    .map(([slug, meta]) => ({ slug, meta }))
    .sort((a, b) => {
      if (a.meta.scope !== b.meta.scope) return a.meta.scope === 'city' ? -1 : 1;
      return a.meta.ru.localeCompare(b.meta.ru, 'ru');
    });
}

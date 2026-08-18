// ══════════════════════════════════════════════════════════════════════
// Районы Ташкента и Самарканда: slug ↔ отображаемое имя.
//
// В базе `customers.district` хранится ЛАТИНСКИЙ SLUG, а не «Чиланзар».
// Причина видна в соседней колонке: `customers.city` по умолчанию
// "Samarqand", а `orders.city` — "tashkent", и сравнение городов давно
// приходится делать через список написаний. Повторять этот разнобой в
// новой колонке незачем — район пишется одним способом, а перевод
// приклеивается здесь, на границе с интерфейсом.
// ══════════════════════════════════════════════════════════════════════

export interface DistrictMeta {
  ru: string;
  uz: string;
  /** Slug города, к которому относится район. */
  city: CitySlug;
}

export const CITY_SLUGS = ['tashkent', 'samarkand'] as const;
export type CitySlug = (typeof CITY_SLUGS)[number];

export const CITY_META: Record<CitySlug, { ru: string; uz: string }> = {
  tashkent: { ru: 'Ташкент', uz: 'Toshkent' },
  samarkand: { ru: 'Самарканд', uz: 'Samarqand' },
};

export const DISTRICTS: Record<string, DistrictMeta> = {
  // Ташкент — 12 туманов.
  bektemir: { ru: 'Бектемир', uz: 'Bektemir', city: 'tashkent' },
  chilanzar: { ru: 'Чиланзар', uz: 'Chilonzor', city: 'tashkent' },
  mirobod: { ru: 'Мирабад', uz: 'Mirobod', city: 'tashkent' },
  'mirzo-ulugbek': { ru: 'Мирзо-Улугбек', uz: 'Mirzo Ulugʻbek', city: 'tashkent' },
  olmazor: { ru: 'Алмазар', uz: 'Olmazor', city: 'tashkent' },
  sergeli: { ru: 'Сергели', uz: 'Sergeli', city: 'tashkent' },
  shayxontohur: { ru: 'Шайхантахур', uz: 'Shayxontohur', city: 'tashkent' },
  uchtepa: { ru: 'Учтепа', uz: 'Uchtepa', city: 'tashkent' },
  yakkasaroy: { ru: 'Яккасарай', uz: 'Yakkasaroy', city: 'tashkent' },
  yangihayot: { ru: 'Янгихаёт', uz: 'Yangihayot', city: 'tashkent' },
  yashnobod: { ru: 'Яшнабад', uz: 'Yashnobod', city: 'tashkent' },
  yunusobod: { ru: 'Юнусабад', uz: 'Yunusobod', city: 'tashkent' },

  // Самарканд — два городских района.
  siyob: { ru: 'Сиаб', uz: 'Siyob', city: 'samarkand' },
  temiryol: { ru: 'Темирйул', uz: 'Temiryoʻl', city: 'samarkand' },
};

export type DistrictSlug = keyof typeof DISTRICTS;

/** Подпись района на языке интерфейса. Неизвестный slug показываем как есть. */
export function districtLabel(slug: string | null, lang: 'ru' | 'uz'): string {
  if (!slug) return lang === 'ru' ? 'Район не определён' : 'Tuman aniqlanmagan';
  const meta = DISTRICTS[slug];
  return meta ? meta[lang] : slug;
}

/** Районы одного города — для выпадающего фильтра. */
export function districtsOfCity(city: CitySlug): { slug: string; meta: DistrictMeta }[] {
  return Object.entries(DISTRICTS)
    .filter(([, meta]) => meta.city === city)
    .map(([slug, meta]) => ({ slug, meta }));
}

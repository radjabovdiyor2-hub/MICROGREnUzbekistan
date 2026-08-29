// ══════════════════════════════════════════════════════════════════════
// Соответствие категорий витрины внешним классификаторам.
//
// Здесь же живёт признак скоропорта: он решает, попадёт ли товар на
// складскую площадку и подчиняется ли он окну отгрузки.
// ══════════════════════════════════════════════════════════════════════

export interface CategoryTaxonomy {
  /**
   * `google_product_category` — ПОЛНЫМ ПУТЁМ, а не числом.
   *
   * Числовой id пришлось бы выписывать по памяти, а неверное значение
   * Merchant отклоняет молча — вместе со всей позицией. Путь строкой
   * Google принимает наравне с id и сверить его можно глазами.
   *
   * Пусто = поле не отдаём вовсе: оно необязательное, Google
   * категоризует сам. Пустое лучше выдуманного.
   */
  googleCategory?: string;
  /** `product_type` — наша собственная ветка, площадкой не проверяется. */
  productType: string;
  /**
   * Скоропорт. По умолчанию (категория неизвестна) считаем ДА: ошибиться
   * в эту сторону значит недопродать, в обратную — отправить лоток, который
   * приедет испорченным, и заплатить штраф за отмену.
   */
  perishable: boolean;
}

const FRESH_VEGETABLES =
  'Food, Beverages & Tobacco > Food Items > Fruits & Vegetables > Fresh & Frozen Vegetables';

const BY_SLUG: Record<string, CategoryTaxonomy> = {
  microgreens: {
    googleCategory: FRESH_VEGETABLES,
    productType: "Mikroko'katlar",
    perishable: true,
  },
  'baby-leaf': {
    googleCategory: FRESH_VEGETABLES,
    productType: 'Baby Leaf',
    perishable: true,
  },
  salads: {
    googleCategory: FRESH_VEGETABLES,
    productType: 'Salatlar',
    perishable: true,
  },
  balans: {
    googleCategory: FRESH_VEGETABLES,
    productType: 'BALANS',
    perishable: true,
  },
  flowers: {
    googleCategory: FRESH_VEGETABLES,
    productType: 'Yeyiladigan gullar',
    perishable: true,
  },
  // Ветки Google для семян, оборудования и наборов не выписаны намеренно:
  // эти категории сейчас не продаются (`CATEGORY_SLUGS` в lib/seo/categories),
  // а угаданный путь отклоняется так же, как угаданный id.
  seeds: { productType: "Urug'lar", perishable: false },
  equipment: { productType: 'Uskunalar', perishable: false },
  sets: { productType: "To'plamlar", perishable: false },
  services: { productType: 'Xizmatlar', perishable: false },
};

const UNKNOWN: CategoryTaxonomy = { productType: 'Microgreen Uzbekistan', perishable: true };

export function taxonomyFor(categorySlug: string | null): CategoryTaxonomy {
  if (!categorySlug) return UNKNOWN;
  return BY_SLUG[categorySlug] ?? UNKNOWN;
}

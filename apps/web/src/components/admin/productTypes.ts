export interface Product {
  id: string;
  nameUz: string;
  nameRu: string;
  price: number;
  oldPrice: number | null;
  costPrice: number | null;
  /** За что назначена цена: «кг», «100 г», «лоток», «шт». */
  unit?: string | null;
  stock: number;
  isActive: boolean;
  isFeatured: boolean;
  isOnSale: boolean;
  images: string[];
  category?: { nameUz: string; nameRu: string; id: string };
}

export interface Category {
  id: string;
  nameUz: string;
  nameRu: string;
  children?: Category[];
}

export const EMPTY_FORM = {
  nameUz: '', nameRu: '', slug: '', price: '', oldPrice: '', costPrice: '',
  categoryId: '', stock: '', sku: '', brand: '', unit: 'шт',
  descriptionUz: '', isFeatured: false, isOnSale: false,
};

/**
 * Единицы, за которые назначается цена.
 *
 * Список закрытый и совпадает с тем, что стоит в прайсе (`price-list.html`):
 * микрозелень продаётся за лоток, бейби-лист за 100 грамм, салаты за
 * килограмм. От единицы зависит не только подпись, но и ШАГ НАБОРА на кассе
 * (`lib/qty#stepFor`): у весового товара кнопки прибавляют по 0.1, у
 * штучного — по одному. Товар с единицей «шт» нельзя продать по 1.3 кг.
 */
export const PRODUCT_UNITS = ['шт', 'лоток', 'кг', '100 г', 'г', 'упак', 'набор'] as const;

export type ProductForm = typeof EMPTY_FORM;

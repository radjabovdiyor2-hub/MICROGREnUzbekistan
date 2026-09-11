// Размер страницы и варианты сортировки каталога.
//
// РАЗДЕЛОВ ЗДЕСЬ БОЛЬШЕ НЕТ: они переехали в `@/lib/catalogSections`, потому
// что тот же ряд стоит на главной, и два списка разошлись — главная звала в
// пустые рубрики, а соусов и линеек в ней не было вовсе.

export const PAGE_SIZE = 24;

export const SORT_OPTIONS = [
  { value: 'featured', labelUz: "Tavsiya etilgan", labelRu: "Рекомендуемые" },
  { value: 'price_asc', labelUz: "Arzon → Qimmat", labelRu: "Дешевле → Дороже" },
  { value: 'price_desc', labelUz: "Qimmat → Arzon", labelRu: "Дороже → Дешевле" },
  { value: 'rating', labelUz: "Reyting bo'yicha", labelRu: "По рейтингу" },
  { value: 'newest', labelUz: "Eng yangi", labelRu: "Новинки" },
];

export interface Product {
  id: string;
  nameUz: string;
  nameRu: string;
  slug: string;
  price: number;
  oldPrice?: number | null;
  /**
   * За что назначена цена: «лоток», «100 г», «кг».
   *
   * У категорий она разная, и без неё «Фризе — 200 000 сум» читается как цена
   * за один кочан. Цена без единицы вводит в заблуждение сильнее, чем её
   * отсутствие.
   */
  unit?: string | null;
  images: string[];
  rating: number;
  reviewCount: number;
  isOnSale?: boolean;
  category?: { nameUz: string; slug: string };
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

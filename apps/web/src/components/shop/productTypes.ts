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

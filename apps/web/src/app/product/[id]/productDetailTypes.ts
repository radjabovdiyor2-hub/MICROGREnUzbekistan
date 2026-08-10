export interface Product {
  id: string;
  nameUz: string;
  nameRu: string;
  slug: string;
  descriptionUz: string | null;
  descriptionRu: string | null;
  price: number;
  /** За что цена: «лоток», «100 г», «кг». У категорий она разная. */
  unit?: string | null;
  oldPrice: number | null;
  images: string[];
  stock: number;
  brand: string | null;
  specs: Record<string, string> | null;
  rating: number;
  reviewCount: number;
  category: { id: string; nameUz: string; nameRu: string; slug: string };
}

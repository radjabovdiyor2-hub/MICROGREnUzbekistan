export interface Product {
  id: string;
  nameUz: string;
  nameRu: string;
  price: number;
  oldPrice: number | null;
  costPrice: number | null;
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
  categoryId: '', stock: '', sku: '', brand: '',
  descriptionUz: '', isFeatured: false, isOnSale: false,
};

export type ProductForm = typeof EMPTY_FORM;

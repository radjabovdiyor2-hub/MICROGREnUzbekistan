// Общие типы кассы. Вынесены отдельно, чтобы AdminPOS и его панели
// (AdminPOSProducts, AdminPOSCart) ссылались на одно объявление,
// а не дублировали формы друг друга.

export interface Product {
  id: string;
  nameUz: string;
  nameRu: string;
  price: number;
  costPrice: number | null;
  stock: number;
  images: string[];
  category?: { nameUz: string };
}

export interface CartItem {
  product: Product;
  quantity: number;
  customPrice: number; // editable sale price
}

export interface DebtInfo {
  personName: string;
  phone: string;
  dueDate: string;
}

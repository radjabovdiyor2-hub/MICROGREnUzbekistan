// Общие типы кассы. Вынесены отдельно, чтобы AdminPOS и его панели
// (AdminPOSProducts, AdminPOSCart) ссылались на одно объявление,
// а не дублировали формы друг друга.

export interface Product {
  id: string;
  nameUz: string;
  nameRu: string;
  price: number;
  /**
   * За что назначена цена: «лоток», «100 г», «кг».
   *
   * На кассе это не украшение: продавец бьёт «2» — и должен видеть, два лотка
   * это или два килограмма. Цена салата за килограмм рядом с ценой
   * микрозелени за лоток без единицы выглядит десятикратной ошибкой.
   */
  unit?: string | null;
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

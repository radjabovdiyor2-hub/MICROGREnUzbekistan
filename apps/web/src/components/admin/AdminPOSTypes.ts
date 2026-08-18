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
  /**
   * Количество — дробное: салат продаётся за килограмм, и 1.3 кг обычная
   * продажа. Шаг набора зависит от единицы (`lib/qty#stepFor`).
   */
  quantity: number;
  customPrice: number; // editable sale price
  /**
   * Почему цена отличается от прайсовой.
   *
   * Сервер откажет в продаже не по прайсу без причины: через месяц владелец
   * видит, что товар за 15 000 ушёл по 13 000, и спросить не у кого.
   */
  priceReason?: string;
}

/** Покупатель чека. Нужен ради договорных цен, а не ради самой продажи. */
export interface PosCustomer {
  id: number;
  name: string;
  phone: string | null;
}

/** Договорная цена товара для выбранного покупателя. */
export interface ContractPrice {
  price: number;
  note: string | null;
}

/** Уступка на весь чек — одна на продажу, а не по позициям. */
export interface CartDiscount {
  type: 'percent' | 'fixed';
  value: string;
  reason: string;
}

/**
 * Деловая дата продажи.
 *
 * Пустая `date` означает «сейчас» — обычный чек. Заполненная включает
 * продажу задним числом, и тогда причина обязательна.
 */
export interface SaleDate {
  date: string;
  reason: string;
}

export interface DebtInfo {
  personName: string;
  phone: string;
  dueDate: string;
}

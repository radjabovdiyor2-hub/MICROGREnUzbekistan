export interface SaleResultData {
  saleNumber: string;
  total: number;
  isReturn?: boolean;
  // Единица нужна и здесь: «1.3» без «кг» в чеке читается как штуки.
  items?: { product: { nameUz: string; unit?: string | null }; quantity: number; customPrice: number }[];
  payMethod?: string;
  date?: string;
}

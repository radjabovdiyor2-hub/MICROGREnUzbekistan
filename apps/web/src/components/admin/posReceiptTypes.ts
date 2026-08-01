export interface SaleResultData {
  saleNumber: string;
  total: number;
  isReturn?: boolean;
  items?: { product: { nameUz: string }; quantity: number; customPrice: number }[];
  payMethod?: string;
  date?: string;
}

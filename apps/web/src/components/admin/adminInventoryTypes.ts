// Формы данных склада. Вынесены из AdminInventory.

export interface InventoryProduct {
  id: string;
  nameUz: string;
  nameRu: string;
  price: number;
  stock: number;
  avgDailySales: number;
  avgMonthlySales: number;
  daysOfSupply: number;
  status: string;
  reorderPoint: number;
  stockValue: number;
  totalSold90d: number;
  category?: { nameUz: string };
}

export interface Summary {
  totalProducts: number;
  totalStockValue: number;
  criticalCount: number;
  lowCount: number;
  excessCount: number;
  normalCount: number;
  todayRevenue: number;
  todayOnlineRevenue: number;
  todayPOSRevenue: number;
  todayOrderCount: number;
  debtsOwedToUs: number;
  debtsWeOwe: number;
}

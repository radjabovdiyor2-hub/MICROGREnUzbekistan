export interface StatsData {
  // Online orders
  totalOrders: number;
  todayOrders: number;
  onlineRevenue: number;
  todayOnlineRevenue: number;
  totalDeliveryFees: number;
  todayDeliveryFees: number;
  // POS sales
  todayPOSSales: number;
  todayPOSRevenue: number;
  todayPOSReturns: number;
  todayReturnCount: number;
  // Combined (from analytics — already adjusted for returns)
  todayTotalRevenue: number;
  todayCost: number;
  todayProfit: number;
  todayMargin: number;
  todayReturns: number;
  // Products
  totalProducts: number;
  activeProducts: number;
  // Order statuses
  pendingOrders: number;
  deliveringOrders: number;
}

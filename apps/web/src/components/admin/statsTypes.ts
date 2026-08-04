// ══════════════════════════════════════════════════════════════════════
// Числа «Сводки». Все до одного приходят из ОДНОГО расчёта
// (/api/inventory/analytics?section=revenue → lib/revenue).
//
// Раньше их собирали четыре разных эндпоинта с разными границами суток и
// разными фильтрами, и они не могли сойтись в принципе: плитка «Выручка за
// сегодня» показывала 1 200 000 при разбивке 0 + 600 000 + 50 000.
// ══════════════════════════════════════════════════════════════════════

export interface StatsData {
  /** Итог дня: goods + доставка − скидки − возвраты. */
  todayTotalRevenue: number;
  /** Слагаемые итога — обязаны складываться в todayTotalRevenue. */
  todayGoodsPos: number;
  todayGoodsOnline: number;
  todayDeliveryFees: number;
  todayDiscount: number;
  todayReturns: number;

  todayCost: number;
  todayProfit: number;
  todayMargin: number;

  todayOrders: number;
  todayPOSSales: number;
  todayReturnCount: number;
  todayUnits: number;
  todayAverageCheck: number;

  /** За 30 дней — «всего» по 20 последним заказам смысла не имело. */
  monthRevenue: number;
  monthOrders: number;
  monthGoodsOnline: number;

  pendingOrders: number;
  deliveringOrders: number;
  activeProducts: number;
}

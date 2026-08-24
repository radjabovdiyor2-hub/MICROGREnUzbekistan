import type { CustomerCard } from '@/lib/customers/card';
import { computeSegment, computeTrend, type SegmentResult } from '@/lib/customers/segments';

// ══════════════════════════════════════════════════════════════════════
// Что можно сказать о клиенте, когда подъехала его карточка.
//
// Обе величины считаются ТОЛЬКО здесь и только по загруженной истории: у
// точки на карте дат заказов нет вовсе — она несёт лишь готовое состояние и
// сумму. Пока карточка грузится, обе равны null, и панель показывает то,
// что знает точка.
//
// Вынесено из CustomerMapPanel: та переросла двести строк, а эти выкладки
// к отрисовке отношения не имеют.
// ══════════════════════════════════════════════════════════════════════

export interface PointInsights {
  /** Уточнённое состояние: по датам оно точнее, чем по счётчикам. */
  segment: SegmentResult | null;
  /** Переход за последний месяц: вырос, просел или стоит на месте. */
  trend: ReturnType<typeof computeTrend> | null;
}

export function pointInsights(data: CustomerCard | undefined): PointInsights {
  if (!data) return { segment: null, trend: null };

  return {
    segment: computeSegment({
      lastOrderDate: data.lastOrderDate,
      // Самый СТАРЫЙ заказ: список приходит от свежих к давним, поэтому
      // первый заказ клиента — последний элемент.
      firstOrderDate: data.orders.at(-1)?.createdAt ?? null,
      ordersCount: data.ordersCount,
      customerType: data.customerType,
    }),
    trend: computeTrend({
      orderDates: data.orders.map((o) => o.createdAt),
      customerType: data.customerType,
    }),
  };
}

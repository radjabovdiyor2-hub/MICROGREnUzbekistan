import type { SalesLedger, SaleLine, OrderLine, ReturnLine } from './salesLedger';
import { soldProductKey } from '@/lib/products/sold';

// ══════════════════════════════════════════════════════════════════════
// Свод по реестру продаж. Здесь и только здесь считается «выручка».
//
// ГЛАВНОЕ ПРАВИЛО, которое раньше не выполнялось:
//
//     revenue = goods + delivery − discount − returns
//
// и разбивка на плитке обязана складываться в эту же цифру. На «Сводке»
// стояло 1 200 000 при разбивке 0 + 600 000 + 50 000: выручка удваивала
// онлайн-заказ, а доставку не включала вовсе — сойтись эти числа не могли
// ни при каких данных.
//
// Скидка вычитается ровно один раз, на уровне заказа: позиции хранят цену
// ДО скидки (`order_items.price`), и `total` заказа собран как
// subtotal + delivery − discount (см. lib/orders/create.ts).
// ══════════════════════════════════════════════════════════════════════

export interface RevenueSummary {
  /** Итог: столько денег принёс период. */
  revenue: number;
  /** Составляющие — в сумме дают revenue. */
  goods: number;
  delivery: number;
  discount: number;
  returns: number;
  /** Из них по каналам (только товары, без доставки). */
  goodsOnline: number;
  goodsPos: number;

  cost: number;
  profit: number;
  margin: number;

  orders: number;
  posSales: number;
  returnCount: number;
  units: number;
  averageCheck: number;
}

function inRange(at: Date, since: Date, until?: Date): boolean {
  const t = at.getTime();
  if (t < since.getTime()) return false;
  return until ? t <= until.getTime() : true;
}

export function summarize(
  ledger: SalesLedger,
  since: Date,
  until?: Date,
): RevenueSummary {
  const sales: SaleLine[] = ledger.sales.filter((s) => inRange(s.at, since, until));
  const orders: OrderLine[] = ledger.orders.filter((o) => inRange(o.at, since, until));
  const returns: ReturnLine[] = ledger.returns.filter((r) => inRange(r.at, since, until));

  const goodsOnline = sales
    .filter((s) => s.channel === 'online')
    .reduce((sum, s) => sum + s.revenue, 0);
  const goodsPos = sales
    .filter((s) => s.channel === 'pos')
    .reduce((sum, s) => sum + s.revenue, 0);

  const delivery = orders.reduce((sum, o) => sum + o.deliveryFee, 0);
  const discount = orders.reduce((sum, o) => sum + o.discount, 0);
  const returnsAmount = returns.reduce((sum, r) => sum + r.amount, 0);

  const goods = goodsOnline + goodsPos;
  const revenue = goods + delivery - discount - returnsAmount;
  const cost = sales.reduce((sum, s) => sum + s.cost, 0);
  const profit = revenue - cost;

  // Продаж всего — заказы плюс чеки кассы. Раньше здесь складывались СТРОКИ
  // движений и заказы, поэтому чек из трёх позиций считался за три продажи.
  const posSales = new Set(
    sales.filter((s) => s.channel === 'pos').map((s) => s.at.getTime()),
  ).size;
  const salesCount = orders.length + posSales;

  return {
    revenue,
    goods,
    delivery,
    discount,
    returns: returnsAmount,
    goodsOnline,
    goodsPos,
    cost,
    profit,
    margin: revenue > 0 ? (profit / revenue) * 100 : 0,
    orders: orders.length,
    posSales,
    returnCount: returns.length,
    units: sales.reduce((sum, s) => sum + s.quantity, 0),
    averageCheck: salesCount > 0 ? Math.round(revenue / salesCount) : 0,
  };
}

/** Спрос по товарам за период — для прогноза закупок и топов.
 *
 *  Тот же реестр, поэтому онлайн-заказ больше не считается дважды: раньше
 *  прогноз видел удвоенный спрос и систематически завышал закупку.
 */
export function demandByProduct(
  ledger: SalesLedger,
  since: Date,
  until?: Date,
): Map<string, { name: string; sold: number; revenue: number; cost: number }> {
  const byProduct = new Map<
    string,
    { name: string; sold: number; revenue: number; cost: number }
  >();
  for (const sale of ledger.sales) {
    if (!inRange(sale.at, since, until)) continue;
    // У удалённого товара `productId` пустой, но продажа была — ключом
    // становится снимок названия, см. `lib/products/sold`.
    const key = soldProductKey(sale);
    const current = byProduct.get(key) ?? {
      name: sale.productName,
      sold: 0,
      revenue: 0,
      cost: 0,
    };
    current.sold += sale.quantity;
    current.revenue += sale.revenue;
    current.cost += sale.cost;
    byProduct.set(key, current);
  }
  return byProduct;
}

/** Выручка по дням — для графика «Доход». */
export function dailySeries(
  ledger: SalesLedger,
  days: number,
  now: Date = new Date(),
): { date: string; revenue: number; cost: number; profit: number; returns: number }[] {
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const day = summarize(ledger, dayStart, dayEnd);
    series.push({
      date: dayStart.toISOString(),
      revenue: day.revenue,
      cost: day.cost,
      profit: day.profit,
      returns: day.returns,
    });
  }
  return series;
}

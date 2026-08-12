import { prisma } from '@repo/database';

// ══════════════════════════════════════════════════════════════════════
// Единственное определение «что такое продажа» на всю витрину.
//
// ЗАЧЕМ ЭТОТ МОДУЛЬ СУЩЕСТВУЕТ
//
// Определений было пять, и все считали по-разному: analyticsRevenue,
// /api/inventory, cron/daily-report, lib/stepan/readTools и /api/admin/stats.
// Самое дорогое расхождение владелец видел на «Сводке»: выручка за сегодня
// 1 200 000 при разбивке 0 + 600 000 + 50 000.
//
// Причина точная. Каждый онлайн-заказ пишет складское движение OUT
// (lib/orders/afterCreate.ts), а аналитика считала продажей И движение,
// И сам заказ — выручка и себестоимость удваивались. Тот же дефект сидел
// в прогнозе закупок и в ответах Стёпана владельцу.
//
// ГРАНИЦА ИСТОЧНИКОВ (то, ради чего файл написан)
//
//   онлайн-продажа = строка `orders`, статус не CANCELLED
//   продажа в точке = движение OUT, где orderId IS NULL И salePrice IS NOT NULL
//   всё прочее OUT  = списание/усушка, это НЕ выручка
//
// `orderId` ставит только afterCreate, `salePrice` — только касса
// (lib/pos/sale.ts). Поэтому пересечения между источниками нет по построению,
// а не по совпадению строк в `reason` — на строках и ломалось: продажи в долг
// пишутся как «Qarzga sotish», не проходили фильтр «Do'kon sotish» и пропадали
// из счётчика кассы, оставаясь при этом в выручке.
// ══════════════════════════════════════════════════════════════════════

export type SaleChannel = 'online' | 'pos';

/** Проданная позиция — ровно один раз, из ровно одного источника. */
export interface SaleLine {
  productId: string;
  productName: string;
  quantity: number;
  revenue: number;
  cost: number;
  at: Date;
  channel: SaleChannel;
}

/** Заказ целиком: доставка, скидка и статус живут здесь, а не в позициях. */
export interface OrderLine {
  id: string;
  at: Date;
  status: string;
  paymentStatus: string;
  goods: number;
  deliveryFee: number;
  discount: number;
  total: number;
  channel: SaleChannel;
}

export interface ReturnLine {
  productId: string;
  productName: string;
  quantity: number;
  amount: number;
  at: Date;
}

export interface SalesLedger {
  sales: SaleLine[];
  orders: OrderLine[];
  returns: ReturnLine[];
  /** Себестоимость единицы: последняя закупка → карточка товара → 0. */
  costOf: (productId: string) => number;
}

/** Начало суток по местному времени — одна граница на все отчёты.
 *
 *  Касса считала день по UTC, аналитика — по локали; для Asia/Samarkand это
 *  пять часов расхождения, и продажи с полуночи до пяти утра попадали в разные
 *  сутки на соседних плитках одного экрана.
 */
export function startOfLocalDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** «YYYY-MM-DD» по местному времени.
 *
 *  `toISOString().slice(0, 10)` отдаёт дату по UTC: с полуночи до пяти утра по
 *  Ташкенту это вчерашнее число. Так номер заказа, оформленного 12 августа в
 *  02:00, получался `M-20260811-…`, и персонал не находил его по дате.
 */
export function formatLocalDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Границы суток по местному времени для «YYYY-MM-DD» (или для сегодня).
 *
 *  Отчёт смены строил их сам: `new Date(`${date}T00:00:00.000Z`)` — это явный
 *  UTC, то есть 05:00 по Ташкенту. Продажа в 03:00 в отчёт за свой день не
 *  попадала, зато попадала в чужой, и «Касса сегодня» на сводке владельца
 *  показывала не то же самое, что отчёт продавца по той же смене.
 *
 *  Верхняя граница — начало следующих суток, сравнение строгое (`lt`):
 *  `23:59:59.999` теряет последнюю миллисекунду часа.
 */
export function localDayRange(date?: string): { start: Date; end: Date } {
  // Строка без суффикса «Z» разбирается как местное время — это и нужно.
  const start = date ? startOfLocalDay(new Date(`${date}T00:00:00`)) : startOfLocalDay();
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function daysAgo(days: number, from: Date = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return startOfLocalDay(d);
}

async function buildCostMap(): Promise<Map<string, number>> {
  const costMap = new Map<string, number>();

  // Последняя закупка с указанной ценой — она ближе всего к реальности.
  const purchases = await prisma.stockMovement.findMany({
    where: { type: 'IN', costPrice: { not: null } },
    select: { productId: true, costPrice: true },
    orderBy: { createdAt: 'desc' },
  });
  for (const m of purchases) {
    if (!costMap.has(m.productId) && m.costPrice) costMap.set(m.productId, m.costPrice);
  }

  // Запасной вариант — себестоимость из карточки товара.
  const products = await prisma.product.findMany({
    where: { costPrice: { not: null } },
    select: { id: true, costPrice: true },
  });
  for (const p of products) {
    if (!costMap.has(p.id) && p.costPrice) costMap.set(p.id, p.costPrice);
  }

  return costMap;
}

/** Собрать реестр продаж за период. Единственная дверь ко всем отчётам. */
export async function loadSalesLedger(from: Date, to?: Date): Promise<SalesLedger> {
  const range = to ? { gte: from, lte: to } : { gte: from };

  const [orders, posMovements, returnMovements, costMap] = await Promise.all([
    prisma.order.findMany({
      // Возврат — это НЕ статус заказа, а отдельное поле `paymentStatus`.
      // Фильтр стоял только по CANCELLED, поэтому возвращённый заказ
      // оставался в выручке полностью: деньги вернули клиенту, а отчёт
      // продолжал их показывать.
      where: {
        createdAt: range,
        status: { not: 'CANCELLED' },
        paymentStatus: { not: 'REFUNDED' },
      },
      include: { items: { include: { product: { select: { nameUz: true } } } } },
      orderBy: { createdAt: 'desc' },
    }),
    // orderId IS NULL отсекает движения онлайн-заказов — их выручку даёт
    // сам заказ. salePrice IS NOT NULL отсекает ручные списания: товар ушёл
    // со склада, но денег за него не приходило.
    prisma.stockMovement.findMany({
      where: {
        type: 'OUT',
        orderId: null,
        salePrice: { not: null },
        createdAt: range,
      },
      include: { product: { select: { nameUz: true, costPrice: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.stockMovement.findMany({
      where: { type: 'IN', reason: { startsWith: 'Qaytarish' }, createdAt: range },
      include: { product: { select: { nameUz: true, price: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    buildCostMap(),
  ]);

  const costOf = (productId: string) => costMap.get(productId) ?? 0;

  const sales: SaleLine[] = [];
  const orderLines: OrderLine[] = [];

  for (const order of orders) {
    const goods = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    orderLines.push({
      id: order.id,
      at: order.createdAt,
      status: order.status,
      paymentStatus: order.paymentStatus,
      goods,
      deliveryFee: order.deliveryFee,
      discount: order.discount,
      total: order.total,
      channel: 'online',
    });
    for (const item of order.items) {
      sales.push({
        productId: item.productId,
        productName: item.product?.nameUz ?? 'Tovar',
        quantity: item.quantity,
        revenue: item.price * item.quantity,
        cost: costOf(item.productId) * item.quantity,
        at: order.createdAt,
        channel: 'online',
      });
    }
  }

  for (const m of posMovements) {
    const quantity = Math.abs(m.quantity);
    // Цена и себестоимость зафиксированы в момент продажи — берём их, а не
    // сегодняшний прайс: иначе вчерашняя выручка менялась бы при смене цены.
    const unitCost = m.costPrice ?? m.product.costPrice ?? costOf(m.productId);
    sales.push({
      productId: m.productId,
      productName: m.product.nameUz,
      quantity,
      revenue: quantity * (m.salePrice ?? 0),
      cost: quantity * unitCost,
      at: m.createdAt,
      channel: 'pos',
    });
  }

  const returns: ReturnLine[] = returnMovements.map((m) => {
    const quantity = Math.abs(m.quantity);
    return {
      productId: m.productId,
      productName: m.product.nameUz,
      quantity,
      // salePrice пишется при возврате; без него берём прайс — но это уже
      // приближение, и оно видно в данных, а не спрятано.
      amount: quantity * (m.salePrice ?? m.product.price),
      at: m.createdAt,
    };
  });

  return { sales, orders: orderLines, returns, costOf };
}

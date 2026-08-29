import { prisma } from '@repo/database';
import { lineTotal } from '@/lib/qty';
import { soldProductName } from '@/lib/products/sold';

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
// ПО КАКОЙ ДАТЕ СЧИТАЕМ
//
// У движений склада — по `soldAt`, деловой дате операции, а не по
// `createdAt`. Продажа, о которой продавец вспомнил на следующий день,
// принадлежит тому дню, когда товар ушёл; время появления строки в базе —
// это про аудит, а не про выручку. Так же устроен `Finance.date`.
//
// У заказов деловой даты нет: их задним числом не оформляют, и `createdAt`
// для них и есть дата продажи.
//
// `orderId` ставит только afterCreate, `salePrice` — только касса
// (lib/pos/sale.ts). Поэтому пересечения между источниками нет по построению,
// а не по совпадению строк в `reason` — на строках и ломалось: продажи в долг
// пишутся как «Qarzga sotish», не проходили фильтр «Do'kon sotish» и пропадали
// из счётчика кассы, оставаясь при этом в выручке.
// ══════════════════════════════════════════════════════════════════════

/**
 * Отбор движений по ДЕЛОВОЙ дате с откатом на время записи.
 *
 * `soldAt` нулевая: колонка добавляется на прод автоматическим `db push`, и
 * заполнить старые строки можно только следующим шагом (см. схему). Пока
 * заполнитель не отработал, деловой даты у них нет — и без этого отката
 * вся прошлая выручка исчезла бы из отчётов на время выкатки.
 */
export const byBusinessDate = (range: { gte: Date; lte?: Date; lt?: Date }) => ({
  OR: [{ soldAt: range }, { soldAt: null, createdAt: range }],
});

/**
 * «Что такое продажа в точке» — одним объектом, чтобы отчёты не переписывали
 * это условие каждый по-своему.
 *
 * `orderId IS NULL` отсекает движения онлайн-заказов: их выручку даёт сам
 * заказ. `salePrice IS NOT NULL` отсекает ручные списания: товар ушёл со
 * склада, а денег за него не приходило.
 *
 * Отдельной константой, потому что копия этого условия уже расходилась:
 * выгрузка «Продажи» отбирала кассу по началу строки `reason`
 * («Do'kon sotish»), и продажи в долг — «Qarzga sotish» — в CSV не попадали
 * вовсе, хотя в выручке админки они были. Одинаковое условие в двух местах
 * держится не аккуратностью, а тем, что оно одно.
 */
export const POS_SALE_WHERE = {
  type: 'OUT',
  orderId: null,
  salePrice: { not: null },
} as const;

export type SaleChannel = 'online' | 'pos';

/** Проданная позиция — ровно один раз, из ровно одного источника. */
export interface SaleLine {
  /**
   * Пустой — товар удалён из каталога окончательно. Продажа при этом
   * остаётся: название берётся из снимка, см. `lib/products/sold`.
   */
  productId: string | null;
  productName: string;
  quantity: number;
  revenue: number;
  cost: number;
  at: Date;
  channel: SaleChannel;
  /**
   * Кому продано. Пустой — покупатель не опознан: продажа за прилавком
   * случайному человеку или заказ без входа в кабинет.
   *
   * Нужен, чтобы считать рентабельность по заведению (`finance/margin.ts`):
   * дальняя точка с мелким заказом выглядит прибыльной, пока не посчитаешь.
   */
  customerId: number | null;
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
  /** Пустой у удалённого товара — см. `SaleLine.productId`. */
  productId: string | null;
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
  costOf: (productId: string | null) => number;
}

/**
 * Границы суток живут в `lib/localDate` — там нет серверных зависимостей.
 * Реэкспорт оставлен, чтобы отчёты продолжали брать их отсюда: определение
 * одно, а календарю кассы больше не нужно тянуть Prisma в браузер.
 */
export { startOfLocalDay, formatLocalDate, localDayRange, daysAgo } from '@/lib/localDate';

async function buildCostMap(): Promise<Map<string, number>> {
  const costMap = new Map<string, number>();

  // Последняя закупка с указанной ценой — она ближе всего к реальности.
  const purchases = await prisma.stockMovement.findMany({
    where: { type: 'IN', costPrice: { not: null } },
    select: { productId: true, costPrice: true },
    orderBy: { createdAt: 'desc' },
  });
  for (const m of purchases) {
    if (!m.productId) continue;
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
        ...POS_SALE_WHERE,
        ...byBusinessDate(range),
      },
      include: {
        product: { select: { nameUz: true, costPrice: true } },
        // Продажа с выезда знает заведение — она и даёт разрез по клиентам.
        sale: { select: { customerId: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.stockMovement.findMany({
      where: { type: 'IN', reason: { startsWith: 'Qaytarish' }, ...byBusinessDate(range) },
      include: { product: { select: { nameUz: true, price: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    buildCostMap(),
  ]);

  // Заказ с витрины знает пользователя, а не карточку клиента: связывает их
  // `Customer.webUserId`. Одним запросом на весь период, а не по заказу.
  const userIds = [...new Set(orders.map((o) => o.userId).filter((id): id is string => !!id))];
  const customerByUser = new Map<string, number>();
  if (userIds.length > 0) {
    const linked = await prisma.customer.findMany({
      where: { webUserId: { in: userIds } },
      select: { id: true, webUserId: true },
    });
    for (const c of linked) if (c.webUserId) customerByUser.set(c.webUserId, c.id);
  }

  // У удалённого товара связи не осталось, а значит и себестоимости:
  // ноль здесь честнее подстановки чужой закупки.
  const costOf = (productId: string | null) => (productId ? costMap.get(productId) ?? 0 : 0);

  const sales: SaleLine[] = [];
  const orderLines: OrderLine[] = [];

  for (const order of orders) {
    const goods = order.items.reduce((sum, i) => sum + lineTotal(i.price, i.quantity), 0);
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
        productName: soldProductName(item),
        quantity: item.quantity,
        revenue: lineTotal(item.price, item.quantity),
        cost: lineTotal(costOf(item.productId), item.quantity),
        at: order.createdAt,
        channel: 'online',
        customerId: (order.userId && customerByUser.get(order.userId)) || null,
      });
    }
  }

  for (const m of posMovements) {
    const quantity = Math.abs(m.quantity);
    // Цена и себестоимость зафиксированы в момент продажи — берём их, а не
    // сегодняшний прайс: иначе вчерашняя выручка менялась бы при смене цены.
    const unitCost = m.costPrice ?? m.product?.costPrice ?? costOf(m.productId);
    sales.push({
      productId: m.productId,
      productName: soldProductName(m),
      quantity,
      revenue: Math.round(quantity * (m.salePrice ?? 0)),
      cost: Math.round(quantity * unitCost),
      at: m.soldAt ?? m.createdAt,
      channel: 'pos',
      customerId: m.sale?.customerId ?? null,
    });
  }

  const returns: ReturnLine[] = returnMovements.map((m) => {
    const quantity = Math.abs(m.quantity);
    return {
      productId: m.productId,
      productName: soldProductName(m),
      quantity,
      // salePrice пишется при возврате; без него берём прайс — но это уже
      // приближение, и оно видно в данных, а не спрятано. У удалённого товара
      // прайса не осталось вовсе, и тогда честнее ноль, чем выдуманное число.
      amount: Math.round(quantity * (m.salePrice ?? m.product?.price ?? 0)),
      at: m.soldAt ?? m.createdAt,
    };
  });

  return { sales, orders: orderLines, returns, costOf };
}

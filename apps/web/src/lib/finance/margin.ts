import { prisma } from '@repo/database';
import { loadSalesLedger, type SaleLine } from '@/lib/revenue/salesLedger';

// ══════════════════════════════════════════════════════════════════════
// Маржинальность в разрезах: по культуре, по заведению, по каналу.
//
// ЗАЧЕМ. Общая цифра прибыли скрывает, что одни позиции кормят, а другие
// проедают. Ровно так же ведёт себя выручка по заведениям: дальняя точка с
// мелким заказом выглядит нормальным клиентом, пока в её себестоимость не
// попадёт дорога.
//
// ПОЧЕМУ СОРТИРОВКА ОТ ХУДШЕГО. Разрез строится не ради красивой картины
// лидеров — их владелец и так знает. Он строится, чтобы увидеть убыточное,
// а убыточное в списке, отсортированном по выручке, оказывается внизу и не
// попадается на глаза. Поэтому первым идёт худшее.
//
// ЧТО НЕ ДЕЛАЕТСЯ ЗДЕСЬ. Доставка в себестоимость пока не входит: у выезда
// нет собственной цены, её ещё предстоит завести. Пока этого нет, разрез по
// каналу показывает валовую маржу, а не полную — и об этом честнее сказать
// в интерфейсе, чем подставить выдуманную стоимость выезда.
// ══════════════════════════════════════════════════════════════════════

export interface MarginRow {
  /** Устойчивый ключ: id товара, id клиента или имя канала. */
  key: string;
  label: string;
  revenue: number;
  cost: number;
  /** Выручка минус себестоимость. Отрицательная — продали ниже закупки. */
  margin: number;
  /**
   * Доля маржи в выручке. `null` — выручки не было: у возврата или
   * бесплатной выдачи доли не существует, и ноль тут соврал бы.
   */
  marginRate: number | null;
  quantity: number;
}

export interface MarginBreakdown {
  byProduct: MarginRow[];
  byCustomer: MarginRow[];
  byChannel: MarginRow[];
}

/** Как называется группа, если ключа нет. */
const UNKNOWN_CUSTOMER = 'Розница и неопознанные';

function group(
  sales: SaleLine[],
  keyOf: (s: SaleLine) => string,
  labelOf: (s: SaleLine) => string,
): MarginRow[] {
  const acc = new Map<string, MarginRow>();

  for (const sale of sales) {
    const key = keyOf(sale);
    const row = acc.get(key) ?? {
      key,
      label: labelOf(sale),
      revenue: 0,
      cost: 0,
      margin: 0,
      marginRate: null,
      quantity: 0,
    };
    row.revenue += sale.revenue;
    row.cost += sale.cost;
    row.quantity += sale.quantity;
    acc.set(key, row);
  }

  const rows = [...acc.values()];
  for (const row of rows) {
    row.margin = row.revenue - row.cost;
    row.marginRate = row.revenue > 0 ? row.margin / row.revenue : null;
  }

  // Худшее — первым: ради этого разрез и строится.
  return rows.sort((a, b) => a.margin - b.margin);
}

/**
 * Разложить продажи по трём разрезам.
 *
 * Имена заведений приходят снаружи: сам реестр продаж их не знает, а тянуть
 * сюда обращение к базе значило бы сделать функцию непроверяемой.
 */
export function summarizeMargin(
  sales: SaleLine[],
  customerNames: Map<number, string>,
): MarginBreakdown {
  return {
    byProduct: group(
      sales,
      (s) => s.productId ?? `name:${s.productName}`,
      (s) => s.productName,
    ),
    // Продажи без опознанного покупателя не выбрасываются: иначе сумма по
    // разрезу разошлась бы с общей выручкой, и разрезу нельзя было бы верить.
    byCustomer: group(
      sales,
      (s) => (s.customerId === null ? 'unknown' : String(s.customerId)),
      (s) =>
        s.customerId === null
          ? UNKNOWN_CUSTOMER
          : customerNames.get(s.customerId) ?? `Клиент №${s.customerId}`,
    ),
    byChannel: group(
      sales,
      (s) => s.channel,
      (s) => (s.channel === 'online' ? 'Витрина' : 'Касса и выезд'),
    ),
  };
}

/** Собрать разрезы за период. */
export async function loadMargin(from: Date, to?: Date): Promise<MarginBreakdown> {
  const ledger = await loadSalesLedger(from, to);

  const ids = [...new Set(ledger.sales.map((s) => s.customerId).filter((id): id is number => id !== null))];
  const customerNames = new Map<number, string>();
  if (ids.length > 0) {
    const customers = await prisma.customer.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, companyName: true },
    });
    for (const c of customers) {
      // Заведение узнают по названию компании; имя контакта — запасной вариант.
      customerNames.set(c.id, c.companyName || c.name || `Клиент №${c.id}`);
    }
  }

  return summarizeMargin(ledger.sales, customerNames);
}

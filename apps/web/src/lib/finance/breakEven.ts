import { prisma } from '@repo/database';
import { loadSalesLedger } from '@/lib/revenue/salesLedger';
import { INVENTORY_CATEGORIES, costKind } from './categories';

// ══════════════════════════════════════════════════════════════════════
// Точка безубыточности: сколько нужно продать, чтобы не работать в убыток.
//
// ОТКУДА БЕРУТСЯ ЧИСЛА И ПОЧЕМУ ИМЕННО ОТТУДА
//
// Выручка и себестоимость — из `salesLedger`, единственного определения
// продажи на витрине. Не из `finances`, хотя доход там тоже есть: строку
// дохода по заказу пишет ОФИС, когда заказ доезжает до CRM. Мост витрина →
// офис умеет отваливаться молча — ради этого и написан `orders/crmAlert.ts`.
// Считать выручку по нему значит получить ноль в тот день, когда сломался
// мост, и не понять почему.
//
// Постоянные расходы — из `finances`: другого места, где живёт аренда, нет.
//
// ЧТО СЧИТАЕТСЯ ПЕРЕМЕННЫМ РАСХОДОМ (главная тонкость файла)
//
// Себестоимость проданного ПЛЮС переменные статьи расходов, КРОМЕ закупок
// запаса. Закупка семян и себестоимость выращенного из них — это один и тот
// же мешок семян, показанный дважды: сначала в момент оплаты поставщику,
// потом в момент продажи. Сложить их — завысить переменные расходы и
// занизить маржу, то есть получить точку безубыточности выше реальной.
//
// Список таких статей — `INVENTORY_CATEGORIES` в categories.ts.
//
// ПО КАКОЙ ДАТЕ
//
// Расходы — по `Finance.date` (деловая дата), а не по `created_at`. Расход,
// внесённый задним числом, при расчёте по времени записи выпал бы из месяца
// и завысил прибыль. То же правило действует в /api/admin/finance и в P&L
// офиса — расхождений между отчётами быть не должно.
// ══════════════════════════════════════════════════════════════════════

/** Слагаемые расчёта — отдельно от него самого, чтобы считать без базы. */
export interface BreakEvenParts {
  /** Расходы, которые придут независимо от продаж. */
  fixedCosts: number;
  /** Выручка за период. */
  revenue: number;
  /** Себестоимость проданного плюс переменные расходы вне запасов. */
  variableCosts: number;
}

export interface BreakEven extends BreakEvenParts {
  /**
   * Доля маржи в выручке.
   *
   * `null` — выручки не было, доля не определена. Ноль и отрицательное
   * значение осмысленны и означают разное: ноль — продаём ровно по
   * себестоимости, отрицательное — продаём дешевле, чем обходится.
   */
  marginRate: number | null;
  /**
   * Выручка, при которой расходы покрыты.
   *
   * `null` при неположительной марже — и это не отсутствие данных, а ответ:
   * при такой марже точка недостижима, сколько ни продавай. Увеличение
   * оборота в этом случае увеличивает убыток.
   */
  revenueNeeded: number | null;
  /** Пройдена ли точка за этот период. */
  covered: boolean;
  /** Сколько не хватает до точки. Отрицательное — запас сверх неё. */
  gap: number | null;
}

/** Чистый расчёт: те же числа на входе — тот же ответ, без обращений к базе. */
export function computeBreakEven(parts: BreakEvenParts): BreakEven {
  const { fixedCosts, revenue, variableCosts } = parts;

  if (revenue <= 0) {
    return {
      ...parts,
      marginRate: null,
      revenueNeeded: null,
      covered: false,
      gap: null,
    };
  }

  const marginRate = (revenue - variableCosts) / revenue;

  if (marginRate <= 0) {
    return { ...parts, marginRate, revenueNeeded: null, covered: false, gap: null };
  }

  const revenueNeeded = fixedCosts / marginRate;

  return {
    ...parts,
    marginRate,
    revenueNeeded,
    covered: revenue >= revenueNeeded,
    gap: revenueNeeded - revenue,
  };
}

/** Собрать слагаемые за период и посчитать. */
export async function loadBreakEven(from: Date, to?: Date): Promise<BreakEven> {
  const [expenses, ledger] = await Promise.all([
    prisma.finance.groupBy({
      by: ['category'],
      where: { type: 'expense', date: to ? { gte: from, lte: to } : { gte: from } },
      _sum: { amount: true },
    }),
    loadSalesLedger(from, to),
  ]);

  let fixedCosts = 0;
  let variableCosts = 0;

  for (const row of expenses) {
    const amount = Number(row._sum.amount ?? 0);
    if (costKind(row.category) === 'fixed') {
      fixedCosts += amount;
      continue;
    }
    // Закупку запаса не прибавляем: она придёт себестоимостью проданного.
    if (INVENTORY_CATEGORIES.includes(row.category)) continue;
    variableCosts += amount;
  }

  let revenue = 0;
  for (const sale of ledger.sales) {
    revenue += sale.revenue;
    variableCosts += sale.cost;
  }

  return computeBreakEven({ fixedCosts, revenue, variableCosts });
}

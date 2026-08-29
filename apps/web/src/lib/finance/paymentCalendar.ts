import { prisma } from '@repo/database';
import { formatLocalDate, startOfLocalDay } from '@/lib/localDate';

// ══════════════════════════════════════════════════════════════════════
// Платёжный календарь: что и когда предстоит заплатить и получить.
//
// ЗАЧЕМ. Долги в обе стороны в системе есть, а вопроса «хватит ли денег к
// двадцатому» они не отвечают: список показывает, КОМУ и СКОЛЬКО, но не
// КОГДА всё это сойдётся в одной неделе. Кассовый разрыв виден в день
// платежа, а нужен за месяц до него.
//
// У микрозелени ритмы расходятся системно, а не случайно: заведения платят
// с отсрочкой, а семена, субстрат и аренда требуют денег вперёд.
//
// ЧТО ЗДЕСЬ ГЛАВНОЕ
//
// 1. Считается ОСТАТОК долга (amount − paidAmount), а не его исходная
//    сумма. Частично погашенный долг в календаре должен весить столько,
//    сколько по нему ещё предстоит.
//
// 2. Долги БЕЗ СРОКА не выбрасываются. Их нельзя положить на день, но
//    молча потерять — значит показать календарь, который не сходится с
//    общей суммой обязательств. Они уходят в отдельную корзину, и владелец
//    видит, что срок не проставлен.
//
// 3. Просроченное собирается в один день «сегодня», а не размазывается по
//    прошлым датам: платить по нему придётся из сегодняшних денег.
// ══════════════════════════════════════════════════════════════════════

export type DebtSide = 'WHO_OWES_US' | 'WE_OWE';

/** Долг в том виде, в каком его понимает календарь. */
export interface DebtLike {
  id: string;
  type: DebtSide;
  personName: string;
  amount: number;
  paidAmount: number;
  dueDate: Date | null;
  isPaid: boolean;
  /**
   * Платёж, задержка которого останавливает производство.
   *
   * Заплатить всем сразу в разрыв не выйдет, и очередь приходится
   * назначать. Первыми идут семена и субстрат: без них не будет посева, а
   * посев не наверстать — цикл занимает недели, и потерянная неделя
   * означает пустые полки через месяц. Задержка любого другого платежа
   * стоит испорченных отношений, но не остановки.
   */
  critical: boolean;
}

export interface CalendarItem {
  id: string;
  personName: string;
  side: DebtSide;
  /** Сколько по долгу ещё предстоит. */
  remaining: number;
  overdue: boolean;
  /** Без этого платежа встаёт производство — см. `DebtLike.critical`. */
  critical: boolean;
}

export interface CalendarDay {
  /** Локальная дата в виде ГГГГ-ММ-ДД. */
  date: string;
  /** Нам должны заплатить. */
  incoming: number;
  /** Мы должны заплатить. */
  outgoing: number;
  /** Разница за день: отрицательная — в этот день денег уходит больше. */
  net: number;
  /** Нарастающее сальдо с начала календаря. */
  balance: number;
  items: CalendarItem[];
}

export interface PaymentCalendar {
  days: CalendarDay[];
  /** Долги без проставленного срока — в календарь их положить некуда. */
  undated: CalendarItem[];
  /** Просроченное на сегодня, отдельной суммой. */
  overdueIncoming: number;
  overdueOutgoing: number;
  /** Худшее сальдо за период: если отрицательное — это и есть разрыв. */
  worstBalance: number;
  /**
   * Сколько предстоит заплатить тем, кто ждать не станет.
   *
   * Отдельным числом, потому что решение в разрыв принимается не по общей
   * сумме долгов, а по этой: её надо закрыть в любом случае, остальное
   * можно двигать.
   */
  criticalOutgoing: number;
}

function remainingOf(debt: DebtLike): number {
  return Math.max(0, debt.amount - debt.paidAmount);
}

/**
 * Разложить долги по дням.
 *
 * Чистая функция: те же долги и та же «сегодня» — тот же календарь.
 */
export function buildPaymentCalendar(debts: DebtLike[], today: Date): PaymentCalendar {
  const todayKey = formatLocalDate(startOfLocalDay(today));
  const byDay = new Map<string, CalendarDay>();
  const undated: CalendarItem[] = [];
  let overdueIncoming = 0;
  let overdueOutgoing = 0;
  let criticalOutgoing = 0;

  const dayOf = (key: string): CalendarDay => {
    const existing = byDay.get(key);
    if (existing) return existing;
    const fresh: CalendarDay = { date: key, incoming: 0, outgoing: 0, net: 0, balance: 0, items: [] };
    byDay.set(key, fresh);
    return fresh;
  };

  for (const debt of debts) {
    if (debt.isPaid) continue;
    const remaining = remainingOf(debt);
    if (remaining <= 0) continue;

    if (!debt.dueDate) {
      undated.push({
        id: debt.id,
        personName: debt.personName,
        side: debt.type,
        remaining,
        overdue: false,
        critical: debt.critical,
      });
      continue;
    }

    const dueKey = formatLocalDate(startOfLocalDay(debt.dueDate));
    const overdue = dueKey < todayKey;
    // Просроченное платится из сегодняшних денег, а не из вчерашних.
    const key = overdue ? todayKey : dueKey;

    const day = dayOf(key);
    day.items.push({
      id: debt.id,
      personName: debt.personName,
      side: debt.type,
      remaining,
      overdue,
      critical: debt.critical,
    });

    if (debt.type === 'WHO_OWES_US') {
      day.incoming += remaining;
      if (overdue) overdueIncoming += remaining;
    } else {
      day.outgoing += remaining;
      if (debt.critical) criticalOutgoing += remaining;
      if (overdue) overdueOutgoing += remaining;
    }
  }

  const days = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));

  // Внутри дня критичное — сверху: если денег хватает не на всё, глаз
  // должен упереться в то, что двигать нельзя, а не искать это в списке.
  for (const day of days) {
    day.items.sort((a, b) => Number(b.critical) - Number(a.critical) || b.remaining - a.remaining);
  }

  let running = 0;
  let worstBalance = 0;
  for (const day of days) {
    day.net = day.incoming - day.outgoing;
    running += day.net;
    day.balance = running;
    if (running < worstBalance) worstBalance = running;
  }

  return { days, undated, overdueIncoming, overdueOutgoing, worstBalance, criticalOutgoing };
}

/**
 * Собрать календарь по непогашенным долгам.
 *
 * КТО КРИТИЧЕН — НЕ СПИСОК ИМЁН, А ФАКТ ПОСТАВКИ. Поставщик считается
 * критичным, если хоть раз привозил семена или субстрат: это видно из
 * прихода сырья и не требует ни ручной пометки, ни нового поля, которое
 * забыли бы проставить у нового поставщика.
 *
 * Долг без привязки к поставщику критичным не считается. Он мог быть
 * заведён руками и относиться к чему угодно — назвать его
 * останавливающим производство означало бы поднять тревогу на пустом
 * месте, а тревога, которая часто ошибается, перестаёт работать.
 */
export async function loadPaymentCalendar(today = new Date()): Promise<PaymentCalendar> {
  const [debts, criticalIntake] = await Promise.all([
    prisma.debt.findMany({
      where: { isPaid: false },
      select: {
        id: true,
        type: true,
        personName: true,
        amount: true,
        paidAmount: true,
        dueDate: true,
        isPaid: true,
        supplierId: true,
      },
    }),
    prisma.rawMaterialMovement.findMany({
      where: { type: 'IN', supplierId: { not: null }, material: { kind: { in: ['SEED', 'SUBSTRATE'] } } },
      select: { supplierId: true },
      distinct: ['supplierId'],
    }),
  ]);

  const criticalSuppliers = new Set(
    criticalIntake.map((m) => m.supplierId).filter((id): id is string => id !== null),
  );

  return buildPaymentCalendar(
    debts.map((d) => ({
      ...d,
      critical: d.type === 'WE_OWE' && d.supplierId !== null && criticalSuppliers.has(d.supplierId),
    })),
    today,
  );
}

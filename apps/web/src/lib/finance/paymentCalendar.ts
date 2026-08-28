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
}

export interface CalendarItem {
  id: string;
  personName: string;
  side: DebtSide;
  /** Сколько по долгу ещё предстоит. */
  remaining: number;
  overdue: boolean;
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
      undated.push({ id: debt.id, personName: debt.personName, side: debt.type, remaining, overdue: false });
      continue;
    }

    const dueKey = formatLocalDate(startOfLocalDay(debt.dueDate));
    const overdue = dueKey < todayKey;
    // Просроченное платится из сегодняшних денег, а не из вчерашних.
    const key = overdue ? todayKey : dueKey;

    const day = dayOf(key);
    day.items.push({ id: debt.id, personName: debt.personName, side: debt.type, remaining, overdue });

    if (debt.type === 'WHO_OWES_US') {
      day.incoming += remaining;
      if (overdue) overdueIncoming += remaining;
    } else {
      day.outgoing += remaining;
      if (overdue) overdueOutgoing += remaining;
    }
  }

  const days = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));

  let running = 0;
  let worstBalance = 0;
  for (const day of days) {
    day.net = day.incoming - day.outgoing;
    running += day.net;
    day.balance = running;
    if (running < worstBalance) worstBalance = running;
  }

  return { days, undated, overdueIncoming, overdueOutgoing, worstBalance };
}

/** Собрать календарь по непогашенным долгам. */
export async function loadPaymentCalendar(today = new Date()): Promise<PaymentCalendar> {
  const debts = await prisma.debt.findMany({
    where: { isPaid: false },
    select: {
      id: true,
      type: true,
      personName: true,
      amount: true,
      paidAmount: true,
      dueDate: true,
      isPaid: true,
    },
  });

  return buildPaymentCalendar(debts, today);
}

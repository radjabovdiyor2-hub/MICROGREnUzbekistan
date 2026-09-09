import { prisma } from '@repo/database';
import { formatLocalDate, startOfLocalDay } from '@/lib/localDate';
import { isoWeekday, type Weekday } from '@/lib/customers/visitSchedule';

// ══════════════════════════════════════════════════════════════════════
// Ожидаемые поступления по объездам: сколько и к какому числу придёт.
//
// ЗАЧЕМ. Платёжный календарь отвечает, сколько нам ДОЛЖНЫ и сколько мы
// должны, — то есть работает с уже случившимися сделками. Но половина
// денег недели ещё не существует как долг: она придёт с заездов, которые
// стоят в расписании. Владелец держит это в голове и оттуда же теряет.
//
// ГЛАВНОЕ ПРАВИЛО: ЭТО ПРОГНОЗ, А НЕ ДОЛГ.
// Ожидаемое поступление НЕ складывается с дебиторкой и НЕ входит в
// сальдо платёжного календаря. Долг — обязательство, которое можно
// требовать; ожидание — предположение, которое не сбудется, если
// заведение сегодня закрыто или взяло меньше обычного. Смешать их значит
// показать кассу лучше, чем она есть, ровно в тот момент, когда решение
// принимается по этой цифре.
//
// ОТКУДА БЕРЁТСЯ СУММА. Средний чек клиента: `totalSpent / ordersCount`.
// Это средняя за всё время, а не за последний месяц: у клиента, который
// полгода назад брал вдвое больше, прогноз будет завышен. Пока история
// заказов не переехала в отдельную витрину, это честнее, чем считать по
// последнему заказу — одна нетипичная покупка сдвинула бы прогноз сильнее.
//
// ЧЕЙ ЗАКАЗ НЕ ПРОГНОЗИРУЕТСЯ. Клиента с историей меньше `MIN_ORDERS`
// заказов. Средний чек по одной покупке — это не среднее, а сама покупка.
// Такие клиенты попадают в `unknown` отдельным списком: заезд к ним
// состоится, но сколько он принесёт, система не знает и не притворяется.
// ══════════════════════════════════════════════════════════════════════

/** Минимум заказов, при котором средний чек считается осмысленным. */
export const MIN_ORDERS = 3;

export interface ScheduledCustomer {
  customerId: number;
  customerName: string;
  weekday: Weekday;
  /** Сумма всех заказов клиента. */
  totalSpent: number;
  ordersCount: number;
}

export interface ExpectedVisit {
  customerId: number;
  customerName: string;
  /** Ожидаемая сумма заезда. Ноль — если истории не хватает. */
  expected: number;
}

export interface ForecastDay {
  /** Локальная дата в виде ГГГГ-ММ-ДД. */
  date: string;
  weekday: Weekday;
  expected: number;
  visits: ExpectedVisit[];
}

export interface VisitForecast {
  days: ForecastDay[];
  /** Сумма ожидаемого за весь горизонт. */
  total: number;
  /**
   * Клиенты в расписании, по которым прогноза нет.
   *
   * Отдельным списком, а не нулём в общей сумме: ноль читается как
   * «ничего не принесёт», а правильное чтение — «неизвестно сколько».
   */
  unknown: { customerId: number; customerName: string; weekday: Weekday }[];
}

/** Средний чек клиента. Ноль — если истории недостаточно. */
export function avgOrder(c: ScheduledCustomer): number {
  if (c.ordersCount < MIN_ORDERS || c.totalSpent <= 0) return 0;
  return Math.round(c.totalSpent / c.ordersCount);
}

/**
 * Разложить объезды по дням вперёд.
 *
 * Чистая функция: то же расписание и та же «сегодня» — тот же прогноз.
 * Горизонт считается ОТ СЕГОДНЯ включительно: заезд сегодняшнего дня ещё
 * не состоялся и деньги по нему ещё придут.
 */
export function buildVisitForecast(
  scheduled: ScheduledCustomer[],
  today: Date,
  days = 14,
): VisitForecast {
  const start = startOfLocalDay(today);
  const horizon = Math.min(Math.max(1, days), 90);

  const unknownSeen = new Set<number>();
  const unknown: VisitForecast['unknown'] = [];
  for (const c of scheduled) {
    if (avgOrder(c) === 0 && !unknownSeen.has(c.customerId)) {
      unknownSeen.add(c.customerId);
      unknown.push({ customerId: c.customerId, customerName: c.customerName, weekday: c.weekday });
    }
  }

  const out: ForecastDay[] = [];
  for (let i = 0; i < horizon; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const wd = isoWeekday(d);

    const visits = scheduled
      .filter((c) => c.weekday === wd)
      .map((c) => ({
        customerId: c.customerId,
        customerName: c.customerName,
        expected: avgOrder(c),
      }))
      .sort((a, b) => b.expected - a.expected);

    if (visits.length === 0) continue;

    out.push({
      date: formatLocalDate(d),
      weekday: wd,
      expected: visits.reduce((acc, v) => acc + v.expected, 0),
      visits,
    });
  }

  return {
    days: out,
    total: out.reduce((acc, d) => acc + d.expected, 0),
    unknown,
  };
}

/**
 * Собрать прогноз по расписанию объездов из базы.
 *
 * Берём только клиентов, у которых заезд стоит в расписании. Разовые
 * планы (`VisitPlan`) сюда не входят намеренно: план составляется на
 * сегодня-завтра и к прогнозу на две недели ничего не добавляет, а
 * дублирование заезда удвоило бы сумму дня.
 */
export async function loadVisitForecast(today = new Date(), days = 14): Promise<VisitForecast> {
  const rows = await prisma.visitSchedule.findMany({
    select: {
      customerId: true,
      weekday: true,
      customer: {
        select: { name: true, companyName: true, totalSpent: true, ordersCount: true, status: true },
      },
    },
  });

  const scheduled: ScheduledCustomer[] = rows
    // Ушедший клиент остаётся в расписании, пока его оттуда не убрали
    // руками. Считать по нему поступления — завышать прогноз на клиента,
    // который уже не покупает.
    .filter((r) => r.customer.status !== 'lost' && r.customer.status !== 'archived')
    .map((r) => ({
      customerId: r.customerId,
      customerName: r.customer.companyName || r.customer.name || `Клиент #${r.customerId}`,
      weekday: r.weekday as Weekday,
      totalSpent: Number(r.customer.totalSpent),
      ordersCount: r.customer.ordersCount,
    }));

  return buildVisitForecast(scheduled, today, days);
}

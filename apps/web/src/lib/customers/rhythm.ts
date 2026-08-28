import { prisma } from '@repo/database';
import { startOfLocalDay } from '@/lib/localDate';

// ══════════════════════════════════════════════════════════════════════
// Выпадение клиента из ритма.
//
// ЗАЧЕМ. В HoReCa уход выглядит не как «перестал покупать навсегда», а как
// пропуск двух заказов подряд. Заведение остаётся в базе со статусом
// «активный», в списках выглядит живым — и молча перестаёт приносить
// деньги. Заметить это можно, только зная его СОБСТВЕННЫЙ ритм: кто-то
// берёт дважды в неделю, кто-то раз в месяц, и одна мерка на всех врёт.
//
// ПОЧЕМУ МЕДИАНА, А НЕ СРЕДНЕЕ. Один длинный перерыв — отпуск, ремонт,
// пересменка шефа — сдвигает среднее так, что следующий настоящий пропуск
// перестаёт выделяться. Медиана к одиночным выбросам равнодушна.
//
// ПОЧЕМУ НЕ МЕНЬШЕ ТРЁХ ЗАКАЗОВ. По двум заказам «ритм» — это один
// промежуток, то есть совпадение. Объявить по нему выпадение значит
// дёргать владельца из-за случайности. Меньше трёх — честно молчим.
// ══════════════════════════════════════════════════════════════════════

/** Во сколько раз тишина должна превысить обычный интервал. */
export const DROPOUT_FACTOR = 2;

/** Меньше этого числа заказов ритма не видно. */
export const MIN_ORDERS = 3;

export interface CustomerHistory {
  customerId: number;
  name: string;
  /** Даты заказов, порядок значения не имеет. */
  orderDates: Date[];
}

export interface Dropout {
  customerId: number;
  name: string;
  /** Обычный интервал между заказами, в днях. */
  typicalDays: number;
  /** Сколько дней клиент молчит. */
  silentDays: number;
  ordersCount: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

const daysBetween = (a: Date, b: Date) =>
  Math.round((startOfLocalDay(b).getTime() - startOfLocalDay(a).getTime()) / 86_400_000);

/**
 * Найти клиентов, выпавших из собственного ритма.
 *
 * Чистая функция: та же история и та же «сегодня» — тот же ответ.
 */
export function detectDropouts(histories: CustomerHistory[], today: Date): Dropout[] {
  const found: Dropout[] = [];

  for (const history of histories) {
    if (history.orderDates.length < MIN_ORDERS) continue;

    const dates = [...history.orderDates].sort((a, b) => a.getTime() - b.getTime());

    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i += 1) {
      gaps.push(daysBetween(dates[i - 1], dates[i]));
    }

    const typicalDays = median(gaps);
    // Ритм «ноль дней» означает несколько заказов в один день — интервала
    // между ними нет, и говорить о выпадении не из чего.
    if (typicalDays <= 0) continue;

    const silentDays = daysBetween(dates[dates.length - 1], today);
    if (silentDays <= typicalDays * DROPOUT_FACTOR) continue;

    found.push({
      customerId: history.customerId,
      name: history.name,
      typicalDays,
      silentDays,
      ordersCount: dates.length,
    });
  }

  // Дольше всех молчащие — первыми.
  return found.sort((a, b) => b.silentDays - a.silentDays);
}

/** Поднять историю заказов и найти выпавших. */
export async function loadDropouts(today = new Date()): Promise<Dropout[]> {
  const orders = await prisma.crmOrder.findMany({
    where: { status: { notIn: ['cancelled', 'canceled'] } },
    select: { customerId: true, createdAt: true, customer: { select: { name: true, companyName: true } } },
  });

  const byCustomer = new Map<number, CustomerHistory>();
  for (const order of orders) {
    const existing = byCustomer.get(order.customerId);
    if (existing) {
      existing.orderDates.push(order.createdAt);
      continue;
    }
    byCustomer.set(order.customerId, {
      customerId: order.customerId,
      name: order.customer.companyName || order.customer.name || `Клиент №${order.customerId}`,
      orderDates: [order.createdAt],
    });
  }

  return detectDropouts([...byCustomer.values()], today);
}

/**
 * Одно оповещение в сутки: проверка живёт в суточном расписании, и чаще
 * напоминать не о чем — за день ритм не меняется.
 */
const QUIET_MS = 20 * 60 * 60 * 1000;

const KIND = 'customer_dropout';

/**
 * Поднять тревогу о выпавших клиентах.
 *
 * Одним сигналом на всех, а не по одному на клиента: выпадают обычно
 * пачками — после праздников или смены сезона, — и лента одинаковых строк
 * перестала бы читаться. Образец гашения повторов взят у `orders/crmAlert.ts`.
 *
 * Никогда не бросает исключение: её зовут из суточного отчёта, и уронить
 * его из-за неудачной записи оповещения было бы хуже самой тишины.
 */
export async function alertDropouts(today = new Date()): Promise<void> {
  try {
    const dropouts = await loadDropouts(today);
    if (dropouts.length === 0) return;

    const since = new Date(today.getTime() - QUIET_MS);
    const already = await prisma.ownerAlert.findFirst({
      where: { kind: KIND, createdAt: { gte: since } },
      select: { id: true },
    });
    if (already) return;

    const worst = dropouts[0];
    const others =
      dropouts.length > 1 ? ` И ещё ${dropouts.length - 1}, кроме него.` : '';

    await prisma.ownerAlert.create({
      data: {
        kind: KIND,
        severity: dropouts.length > 2 ? 'critical' : 'warning',
        title: `Клиенты выпали из ритма: ${dropouts.length}`,
        message:
          `«${worst.name}» брал раз в ${worst.typicalDays} дн., а молчит ` +
          `${worst.silentDays}.${others} Это не «перестал покупать навсегда», ` +
          'а пропуск двух заказов подряд — в списках такой клиент всё ещё ' +
          'выглядит активным. Позвонить дешевле, чем искать нового: новый ' +
          'обходится в разы дороже удержанного.',
        source: 'web',
      },
    });
  } catch (err) {
    console.error('[rhythm] не удалось записать оповещение о выпавших клиентах:', err);
  }
}


import { prisma } from '@repo/database';
import { startOfLocalDay } from '@/lib/localDate';

// ══════════════════════════════════════════════════════════════════════
// Получено, но не отработано.
//
// ЗАЧЕМ. Деньги за оплаченный, но не доставленный заказ лежат на счету и
// выглядят как свои. Они не свои: за ними стоит обязательство привезти
// товар, а при отказе — вернуть. Потратив их на закупку, легко оказаться
// должным продукт, на который уже нет семян.
//
// ЧТО СЮДА ВХОДИТ. Заказ оплачен (`paymentStatus: PAID`) и ещё не доставлен
// (`status` не DELIVERED и не CANCELLED). Отменённый не в счёт: там долг не
// товаром, а возвратом денег, и это другой разговор.
//
// ЧЕГО СЮДА НЕ ВХОДИТ И ПОЧЕМУ. Подписки GreenBox — в схеме у них нет
// предоплаты: поставка создаёт обычный заказ, а не списывается с
// оплаченного вперёд цикла. Появится предоплата — её нужно будет добавить
// сюда же. Пока её нет, приписывать подпискам несуществующий аванс значило
// бы завысить обязательства.
// ══════════════════════════════════════════════════════════════════════

/** Оплаченный, но не выполненный заказ. */
export interface UnearnedOrder {
  id: string;
  amount: number;
  paidAt: Date;
  /** Сколько дней деньги лежат неотработанными. */
  daysWaiting: number;
}

export interface Unearned {
  total: number;
  count: number;
  /** Самые давние — первыми: чем дольше ждёт, тем ближе к возврату. */
  orders: UnearnedOrder[];
}

interface OrderLike {
  id: string;
  total: number;
  createdAt: Date;
}

/** Чистый расчёт: те же заказы и та же «сегодня» — тот же ответ. */
export function summarizeUnearned(orders: OrderLike[], today: Date): Unearned {
  const startOfToday = startOfLocalDay(today);

  const rows: UnearnedOrder[] = orders.map((o) => ({
    id: o.id,
    amount: o.total,
    paidAt: o.createdAt,
    daysWaiting: Math.max(
      0,
      Math.floor((startOfToday.getTime() - startOfLocalDay(o.createdAt).getTime()) / 86_400_000),
    ),
  }));

  rows.sort((a, b) => b.daysWaiting - a.daysWaiting);

  return {
    total: rows.reduce((sum, r) => sum + r.amount, 0),
    count: rows.length,
    orders: rows,
  };
}

/** Собрать неотработанные авансы. */
export async function loadUnearned(today = new Date()): Promise<Unearned> {
  const orders = await prisma.order.findMany({
    where: {
      paymentStatus: 'PAID',
      status: { notIn: ['DELIVERED', 'CANCELLED'] },
    },
    select: { id: true, total: true, createdAt: true },
  });

  return summarizeUnearned(orders, today);
}

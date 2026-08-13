import { NextResponse } from 'next/server';
import { prisma, Prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { createOrder } from '@/lib/orders/create';
import { runAfterCreate } from '@/lib/orders/afterCreate';

// ══════════════════════════════════════════════════════════════════════
// Исполнение подписок: подошедшая дата → заказ.
//
// До этого роута подписка была витриной без задней двери: `GreenBoxSubscription`
// создавалась, `nextDelivery` записывалась, и на этом всё заканчивалось —
// ни один модуль эту дату не читал, заказ не рождался никогда.
//
// ЗАКАЗ СОЗДАЁТ ТОЛЬКО ВИТРИНА
//
// Зовём `createOrder` напрямую, а не ходим HTTP-запросом в собственный
// `/api/orders`: это тот же процесс и та же единственная дверь. Следом
// обязателен `runAfterCreate` — списание остатков, уведомления и зеркало в CRM
// живут там, и без него заказ повис бы невидимым для склада и офиса.
//
// ЗАЩИТА ОТ ДВОЙНОЙ ОТГРУЗКИ
//
// Расписание может сработать дважды: повторный запуск, ретрай, две реплики.
// Поэтому сначала создаётся `SubscriptionDelivery` с уникальным
// (subscriptionId, date) — это заявка на слот. Проиграл гонку → 409 от базы →
// заказ не создаём. Только выиграв слот, оформляем заказ.
// ══════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic';

const INTERVAL_DAYS: Record<string, number> = {
  WEEKLY: 7,
  BIWEEKLY: 14,
  MONTHLY: 28,
};

/** Сегодняшний календарный день как UTC-полночь — в том же виде, что `@db.Date`. */
function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/**
 * Следующая дата доставки: шагаем интервалом от ПРОШЛОЙ даты, а не от «сегодня».
 *
 * Так день недели остаётся тем, который выбрал клиент. И так простой крона на
 * несколько недель не превращается в очередь из пропущенных заказов: даты
 * проматываются, а отгрузка происходит одна.
 */
function advance(from: Date, interval: string, today: Date): Date {
  const step = INTERVAL_DAYS[interval] ?? 7;
  const next = new Date(from);
  do {
    next.setUTCDate(next.getUTCDate() + step);
  } while (next <= today);
  return next;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return unauthorized();

  const today = todayUtc();
  const due = await prisma.greenBoxSubscription.findMany({
    where: { status: 'ACTIVE', nextDelivery: { lte: today } },
    include: {
      items: true,
      user: { select: { firstName: true, lastName: true } },
    },
  });

  let created = 0;
  let skipped = 0;
  const failures: { subscriptionId: string; reason: string }[] = [];

  for (const sub of due) {
    if (sub.items.length === 0) {
      failures.push({ subscriptionId: sub.id, reason: 'Пустой состав подписки' });
      continue;
    }

    // Заявка на слот. Уникальность (subscriptionId, date) — единственное, что
    // отделяет клиента от второго заказа на тот же день.
    let delivery;
    try {
      delivery = await prisma.subscriptionDelivery.create({
        data: { subscriptionId: sub.id, date: sub.nextDelivery },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        skipped++;
        continue;
      }
      throw e;
    }

    const result = await createOrder(
      {
        customer: {
          firstName: sub.user.firstName || 'Mijoz',
          lastName: sub.user.lastName,
          phone: sub.phone,
          address: sub.address,
          note: sub.note,
        },
        items: sub.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        paymentMethod: 'cash',
        city: sub.city,
        source: 'subscription',
      },
      // Владелец известен из самой подписки — доверять телу нечему и незачем.
      { customerId: sub.userId, trusted: false },
    );

    if (!result.ok) {
      // Слот остаётся занятым намеренно: повтор крона не должен молча
      // подобрать этот же день. Строка без `orderId` — это сигнал разобрать
      // руками, а не тихо потерянная отгрузка.
      failures.push({ subscriptionId: sub.id, reason: result.error });
      continue;
    }

    const { order, user, customerName } = result;
    await runAfterCreate(order, user, customerName);

    await prisma.$transaction([
      prisma.subscriptionDelivery.update({
        where: { id: delivery.id },
        data: { orderId: order.id },
      }),
      prisma.greenBoxSubscription.update({
        where: { id: sub.id },
        data: { nextDelivery: advance(sub.nextDelivery, sub.interval, today) },
      }),
    ]);
    created++;
  }

  return NextResponse.json({
    success: true,
    due: due.length,
    created,
    skipped,
    failures,
  });
}

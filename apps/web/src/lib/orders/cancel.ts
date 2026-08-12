import { prisma } from '@repo/database';

// ══════════════════════════════════════════════════════════════════════
// Возврат товара на склад при отмене заказа.
//
// ЗАЧЕМ. Отмена заказа меняла только `status`. Товар при этом оставался
// списанным навсегда: `runAfterCreate` уменьшил остаток при создании заказа,
// а обратной операции не существовало ни на одном из трёх путей отмены
// (админка, PUT /api/orders, обратная синхронизация из офиса).
//
// Расхождение при этом одностороннее и накапливающееся: из выручки заказ
// исчезал (все отчёты фильтруют CANCELLED), а из остатка — нет. Через месяц
// склад в системе меньше реального ровно на сумму отмен.
//
// ИДЕМПОТЕНТНОСТЬ. Компенсирующее движение помечается `reason` с номером
// заказа и хранит `orderId`. Повторная отмена (а её легко вызвать: кнопка в
// админке, кнопка в боте и обратная синхронизация из офиса ведут к одному
// и тому же заказу) находит это движение и не делает ничего.
// ══════════════════════════════════════════════════════════════════════

export const CANCEL_REASON_PREFIX = 'Отмена заказа';

// Обратная операция: заказ вышел из отмены и снова живой.
//
// Идемпотентность была ОДНОСТОРОННЕЙ: маркер возврата навсегда запрещал
// повторный возврат, а операции «забрать обратно» не существовало вовсе.
// Оператор, промахнувшийся по кнопке «Отменён» и сразу исправивший статус,
// оставлял склад с лишними единицами (их продадут второй раз), клиента — с
// баллами при живом заказе, где скидка уже учтена в сумме, и промокод с
// `maxUses: 1` снова доступным. Вторая отмена уже ничего не возвращала, так
// что расхождение фиксировалось навсегда и в обе стороны.
export const REVIVE_REASON_PREFIX = 'Снятие отмены заказа';

/**
 * Вернуть клиенту бонусы и освободить использование промокода.
 *
 * Этого не делалось вовсе: `createOrder` списывает баллы условным
 * декрементом, а отмена возвращала только товар. Клиент, чей заказ отменили,
 * терял баллы навсегда и об этом не узнавал. Промокод так же сгорал —
 * лимит тратился на заказ, которого не было.
 *
 * Отделить одно от другого стало возможно только после того, как заказ начал
 * хранить раскладку скидки: в `discount` бонусы и промокод слиты в одну сумму.
 */
async function refundOrderDiscounts(order: {
  id: string;
  orderNumber: string;
  userId: string;
  bonusUsed: number;
  promoCode: string | null;
}): Promise<void> {
  if (order.bonusUsed > 0) {
    await prisma.user
      .update({
        where: { id: order.userId },
        data: { bonusPoints: { increment: order.bonusUsed } },
      })
      .catch((err) => console.error('Bonus refund failed:', err));
  }

  if (order.promoCode) {
    // Не опускаем ниже нуля: промокод могли обнулить вручную в админке,
    // и декремент увёл бы счётчик в минус.
    await prisma.promoCode
      .updateMany({
        where: { code: order.promoCode, usedCount: { gt: 0 } },
        data: { usedCount: { decrement: 1 } },
      })
      .catch((err) => console.error('Promo release failed:', err));
  }
}

/**
 * Вернуть на склад товар отменённого заказа.
 *
 * Возвращает число позиций, которые действительно вернули: 0 значит либо
 * «уже возвращали», либо «заказ без позиций». Вызывающему это нужно только
 * для лога — молчаливый ноль здесь нормален и ожидаем.
 */
export async function restoreStockForCancelledOrder(orderId: string): Promise<number> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      userId: true,
      bonusUsed: true,
      promoCode: true,
      items: { select: { productId: true, quantity: true } },
    },
  });
  if (!order) return 0;

  const reason = `${CANCEL_REASON_PREFIX} #${order.orderNumber}`;
  const reviveReason = `${REVIVE_REASON_PREFIX} #${order.orderNumber}`;

  // Возврат разрешён, только если он не «висит» уже сделанным. Считаем пары:
  // сколько раз возвращали и сколько раз забирали обратно. Простой проверки
  // «маркер есть» не хватает — после снятия отмены заказ можно отменить
  // снова, и тогда товар обязан вернуться во второй раз.
  const [restores, revives] = await Promise.all([
    prisma.stockMovement.count({ where: { orderId: order.id, type: 'IN', reason } }),
    prisma.stockMovement.count({
      where: { orderId: order.id, type: 'OUT', reason: reviveReason },
    }),
  ]);
  if (restores > revives) return 0;

  // Бонусы и промокод возвращаются ДО товара: их возврат дешевле повторить,
  // чем движение склада, если что-то оборвётся посередине.
  await refundOrderDiscounts(order);

  if (order.items.length === 0) return 0;

  let restored = 0;
  for (const item of order.items) {
    // Остаток и запись в журнал — одной транзакцией. Раньше в соседнем коде
    // (afterCreate) это были два независимых запроса, и падение между ними
    // оставляло склад без объяснения, откуда делся товар.
    await prisma.$transaction([
      prisma.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      }),
      prisma.stockMovement.create({
        data: {
          productId: item.productId,
          type: 'IN',
          quantity: item.quantity,
          reason,
          orderId: order.id,
          performedBy: 'System',
        },
      }),
    ]);
    restored++;
  }

  return restored;
}

/**
 * Забрать обратно то, что вернула отмена: заказ снова живой.
 *
 * Зеркало `restoreStockForCancelledOrder`. Вызывается при выходе заказа из
 * `CANCELLED`/`REFUNDED`. Возвращает число позиций, списанных повторно.
 */
export async function reapplyStockForRevivedOrder(orderId: string): Promise<number> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      userId: true,
      bonusUsed: true,
      promoCode: true,
      items: { select: { productId: true, quantity: true } },
    },
  });
  if (!order) return 0;

  const reason = `${CANCEL_REASON_PREFIX} #${order.orderNumber}`;
  const reviveReason = `${REVIVE_REASON_PREFIX} #${order.orderNumber}`;

  // Забирать обратно нечего, если возврата не было: заказ, который никогда не
  // отменяли, при смене статуса не должен терять остаток второй раз.
  const [restores, revives] = await Promise.all([
    prisma.stockMovement.count({ where: { orderId: order.id, type: 'IN', reason } }),
    prisma.stockMovement.count({
      where: { orderId: order.id, type: 'OUT', reason: reviveReason },
    }),
  ]);
  if (restores <= revives) return 0;

  // Скидки — первыми, как и при возврате: их проще повторить.
  if (order.bonusUsed > 0) {
    // Условное списание: баллы клиент мог уже потратить. Не ушли в минус —
    // значит, скидка в сумме заказа больше ничем не обеспечена, и это видно
    // в логе, а не молча.
    const taken = await prisma.user.updateMany({
      where: { id: order.userId, bonusPoints: { gte: order.bonusUsed } },
      data: { bonusPoints: { decrement: order.bonusUsed } },
    });
    if (taken.count === 0) {
      console.error(
        `Revive #${order.orderNumber}: не хватило баллов, чтобы забрать ${order.bonusUsed}`,
      );
    }
  }

  if (order.promoCode) {
    await prisma.promoCode
      .updateMany({ where: { code: order.promoCode }, data: { usedCount: { increment: 1 } } })
      .catch((err) => console.error('Promo re-consume failed:', err));
  }

  let reapplied = 0;
  for (const item of order.items) {
    await prisma.$transaction([
      prisma.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      }),
      prisma.stockMovement.create({
        data: {
          productId: item.productId,
          type: 'OUT',
          quantity: item.quantity,
          reason: reviveReason,
          orderId: order.id,
          performedBy: 'System',
        },
      }),
    ]);
    reapplied++;
  }

  return reapplied;
}

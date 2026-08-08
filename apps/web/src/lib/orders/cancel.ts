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

  // Уже возвращали? Тогда выходим — иначе вторая отмена удвоила бы остаток
  // и второй раз начислила бы бонусы.
  const already = await prisma.stockMovement.findFirst({
    where: { orderId: order.id, type: 'IN', reason },
    select: { id: true },
  });
  if (already) return 0;

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

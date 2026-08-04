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
      items: { select: { productId: true, quantity: true } },
    },
  });
  if (!order || order.items.length === 0) return 0;

  const reason = `${CANCEL_REASON_PREFIX} #${order.orderNumber}`;

  // Уже возвращали? Тогда выходим — иначе вторая отмена удвоила бы остаток.
  const already = await prisma.stockMovement.findFirst({
    where: { orderId: order.id, type: 'IN', reason },
    select: { id: true },
  });
  if (already) return 0;

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

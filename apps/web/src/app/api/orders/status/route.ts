import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma, OrderStatus } from '@repo/database';
import { notifyCustomer } from '@/lib/notify';
import { customerStatusText } from '@/lib/orderSync';
import { restoreStockForCancelledOrder } from '@/lib/orders/cancel';

// ==========================================
// Reverse status sync: AI-office -> storefront.
//
// The office (microgreen) is the source of truth for the order lifecycle. When
// staff change an order's status there, the office calls this endpoint so the
// storefront copy (microgreen_db) matches and the customer gets notified via the
// storefront bot. This endpoint deliberately does NOT push back to the office
// (that would loop) — it only updates Prisma + DMs the customer.
//
// Auth: shared INGEST_SECRET (same as the storefront -> office bridge).
// ==========================================

// Office status (microgreen.orders CHECK) -> Prisma OrderStatus.
const OFFICE_TO_PRISMA: Record<string, OrderStatus> = {
  new: OrderStatus.PENDING,
  confirmed: OrderStatus.CONFIRMED,
  preparing: OrderStatus.PREPARING,
  ready: OrderStatus.PREPARING,
  delivering: OrderStatus.DELIVERING,
  delivered: OrderStatus.DELIVERED,
  cancelled: OrderStatus.CANCELLED,
};

/** Приводит статус офиса к enum витрины. null — статус неизвестен, запись не делаем.
 *
 *  Возвращаемый тип — именно OrderStatus, а не string: раньше здесь был string,
 *  и на записи стояло `status as any`. Каст глушил как раз ту проверку, ради
 *  которой функция и написана — добавь кто-нибудь в OFFICE_TO_PRISMA значение
 *  с опечаткой, компилятор бы промолчал, а Prisma упала бы в рантайме. */
function normalizeStatus(raw: unknown): OrderStatus | null {
  if (typeof raw !== 'string' || !raw) return null;
  const upper = raw.toUpperCase();
  if (upper in OrderStatus) return OrderStatus[upper as keyof typeof OrderStatus];
  return OFFICE_TO_PRISMA[raw.toLowerCase()] ?? null;
}

export async function POST(request: NextRequest) {
  // Auth — timing-safe comparison.
  //
  // Отсутствие секрета в проде = ОТКАЗ, а не свободный вход. Здесь стояло
  // `if (secret) { ...проверка... }`: не задана переменная — проверки нет
  // вовсе, и эндпоинт открыт всему интернету. А он меняет статус заказа,
  // пишет клиенту и при отмене возвращает товар на склад.
  //
  // Так же поступают обе соседние двери: `lib/botAuth.ts` и приёмник офиса
  // `web_office/main.py` при пустом секрете в проде отвечают отказом.
  const secret = process.env.INGEST_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('FATAL: INGEST_SECRET is missing in production!');
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  } else {
    const provided = request.headers.get('x-ingest-secret') ?? '';
    if (provided.length !== secret.length ||
        !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  try {
    const body = await request.json();
    const orderNumber: string | undefined = body.order_number || body.orderNumber;
    const status = normalizeStatus(body.status);

    if (!orderNumber) {
      return NextResponse.json({ error: 'order_number required' }, { status: 400 });
    }
    if (!status) {
      return NextResponse.json({ error: 'valid status required' }, { status: 400 });
    }

    const existing = await prisma.order.findUnique({ where: { orderNumber } });
    if (!existing) {
      return NextResponse.json({ error: 'order not found' }, { status: 404 });
    }
    // Idempotent: nothing to do if already there.
    if (existing.status === status) {
      return NextResponse.json({ status: 'unchanged' });
    }

    const order = await prisma.order.update({
      where: { orderNumber },
      data: { status },
      include: { user: { select: { telegramId: true, language: true } } },
    });

    if (order.user?.telegramId) {
      await notifyCustomer(
        order.user.telegramId,
        customerStatusText(order.orderNumber, order.status, order.user.language),
      );
    }

    // Отмена из офиса тоже возвращает товар на склад. Обратно в офис мы
    // намеренно НЕ ходим (это замкнуло бы петлю синхронизации), поэтому
    // возврат вызывается здесь напрямую, а не через syncOrderStatus.
    if (order.status === 'CANCELLED') {
      await restoreStockForCancelledOrder(order.id).catch((err) =>
        console.error('Stock restore on office cancel failed:', err),
      );
    }

    return NextResponse.json({ status: 'ok', order: { orderNumber: order.orderNumber, status: order.status } });
  } catch (error) {
    console.error('Reverse status sync error:', error);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}

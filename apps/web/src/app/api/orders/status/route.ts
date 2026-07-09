import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { notifyCustomer } from '@/lib/notify';
import { customerStatusText } from '@/lib/orderSync';

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
const OFFICE_TO_PRISMA: Record<string, string> = {
  new: 'PENDING',
  confirmed: 'CONFIRMED',
  preparing: 'PREPARING',
  ready: 'PREPARING',
  delivering: 'DELIVERING',
  delivered: 'DELIVERED',
  cancelled: 'CANCELLED',
};

const PRISMA_STATUSES = new Set([
  'PENDING', 'CONFIRMED', 'PREPARING', 'DELIVERING', 'DELIVERED', 'CANCELLED',
]);

function normalizeStatus(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  const upper = raw.toUpperCase();
  if (PRISMA_STATUSES.has(upper)) return upper;
  return OFFICE_TO_PRISMA[raw.toLowerCase()] ?? null;
}

export async function POST(request: NextRequest) {
  // Auth
  const secret = process.env.INGEST_SECRET;
  if (secret && request.headers.get('x-ingest-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
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
      data: { status: status as any },
      include: { user: { select: { telegramId: true, language: true } } },
    });

    if (order.user?.telegramId) {
      await notifyCustomer(
        order.user.telegramId,
        customerStatusText(order.orderNumber, order.status, order.user.language),
      );
    }

    return NextResponse.json({ status: 'ok', order: { orderNumber: order.orderNumber, status: order.status } });
  } catch (error) {
    console.error('Reverse status sync error:', error);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}

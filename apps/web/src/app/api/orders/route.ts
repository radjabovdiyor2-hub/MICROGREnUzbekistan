import { NextRequest, NextResponse } from 'next/server';
import { prisma, Prisma, OrderStatus } from '@repo/database';
import { syncOrderStatus } from '@/lib/orderSync';
import { isStaff, unauthorized } from '@/lib/adminAuth';
import { consume, clientIp, tooManyRequests } from '@/lib/rateLimit';

import { orderSchema } from '@/lib/orders/schema';
import { runAfterCreate } from '@/lib/orders/afterCreate';
import { createOrder } from '@/lib/orders/create';

// ==========================================
// Orders API — Create & List (Prisma-backed)
//
// Уведомления и схемы разбора лежат в lib/orders: в route.ts Next.js
// разрешает экспортировать только HTTP-обработчики.
// ==========================================

// POST — Create order
export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const orderLimit = await consume(`order:${ip}`, 10, 60_000);
  if (!orderLimit.ok) return tooManyRequests(orderLimit.retryAfter);

  try {
    const rawBody = await request.json();
    const parseResult = orderSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return NextResponse.json({ error: "Noto'g'ri ma'lumot formati", details: parseResult.error.issues }, { status: 400 });
    }
    const body = parseResult.data;
    const result = await createOrder(body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const { order, user, customerName } = result;

    await runAfterCreate(order, user, customerName);


    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        total: order.total,
        status: order.status,
      },
    });

  } catch (error) {
    console.error('Order creation error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

// GET — List orders (admin) with pagination
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const page = parseInt(searchParams.get('page') || '1');
  const limitRaw = parseInt(searchParams.get('limit') || '20');
  const limit = Math.min(limitRaw, 100);

  const phone = searchParams.get('phone');
  const userId = searchParams.get('userId');
  const telegramId = searchParams.get('telegramId');

  // Выборка без привязки к конкретному покупателю — это выгрузка всей базы
  // заказов с именами и телефонами. Раньше она была открыта: /api/orders
  // без параметров отдавал всё подряд кому угодно.
  // Запрос своих заказов (профиль покупателя фильтрует по userId) остаётся
  // доступным без сессии — это существующее поведение личного кабинета.
  const scopedToUser = Boolean(phone || userId || telegramId);
  if (!scopedToUser && !isStaff(request)) {
    return unauthorized();
  }

  const where: Prisma.OrderWhereInput =
    status && status !== 'ALL' && status in OrderStatus
      ? { status: OrderStatus[status as keyof typeof OrderStatus] }
      : {};
  if (phone) where.phone = phone;
  if (userId) where.userId = userId;

  // Support filtering by telegramId — resolve to userId first
  if (telegramId) {
    try {
      const tgUser = await prisma.user.findUnique({
        where: { telegramId: BigInt(telegramId) },
        select: { id: true },
      });
      if (tgUser) {
        where.userId = tgUser.id;
      } else {
        // No user with this telegramId — return empty results
        return NextResponse.json({
          orders: [],
          total: 0,
          pagination: { page, limit, totalPages: 0 },
        });
      }
    } catch {
      return NextResponse.json({ error: 'Invalid telegramId' }, { status: 400 });
    }
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        items: {
          include: {
            product: { select: { nameUz: true, nameRu: true, images: true } },
          },
        },
        user: { select: { firstName: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return NextResponse.json({
    orders,
    total,
    pagination: {
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
}

// PUT — Update order status (admin)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, paymentStatus } = body;

    if (!id) {
      return NextResponse.json({ error: 'Order ID required' }, { status: 400 });
    }

    const data: Record<string, string> = {};
    if (status) data.status = status;
    if (paymentStatus) data.paymentStatus = paymentStatus;

    const order = await prisma.order.update({
      where: { id },
      data,
      include: { user: { select: { telegramId: true, language: true } } },
    });

    // Notify the customer + mirror the status into the AI-office CRM.
    await syncOrderStatus(order);

    return NextResponse.json({ success: true, order });
  } catch (error) {
    console.error('Order update error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

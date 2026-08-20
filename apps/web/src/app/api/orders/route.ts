import { NextRequest, NextResponse } from 'next/server';
import { prisma, Prisma, OrderStatus } from '@repo/database';
import { syncOrderStatus } from '@/lib/orderSync';
import { isAuthorized, isStaff, getCustomerId, unauthorized } from '@/lib/adminAuth';
import { requireBotAuth } from '@/lib/botAuth';
import { consume, clientIp, tooManyRequests } from '@/lib/rateLimit';

import { orderSchema } from '@/lib/orders/schema';
import { runAfterCreate } from '@/lib/orders/afterCreate';
import { createOrder } from '@/lib/orders/create';
import { publish } from '@/lib/realtime/bus';

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
    const result = await createOrder(body, {
      customerId: getCustomerId(request),
      trusted: requireBotAuth(request),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const { order, user, customerName } = result;

    await runAfterCreate(order, user, customerName);

    // Заказ есть и остатки списаны — открытые экраны узнают об этом сами.
    // Сюда приходят все три источника: витрина, бот и ИИ-офис, — потому что
    // заказ создаёт только эта дверь (конституция, §«Заказ создаёт витрина»).
    publish('orders', 'inventory', 'products');


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

  let phone = searchParams.get('phone');
  let userId = searchParams.get('userId');
  let telegramId = searchParams.get('telegramId');

  // Кто спрашивает — решается здесь, а не по наличию параметров.
  //
  // Раньше признаком «свои заказы» считался сам факт того, что фильтр задан:
  // `scopedToUser = Boolean(phone || userId || telegramId)`. То есть любой,
  // кто подставил чужой userId — или просто чужой номер телефона, а у B2B он
  // публичен, — получал историю заказов этого клиента с адресами доставки.
  //
  // Теперь у покупателя есть подписанная сессия (lib/session.ts), и его
  // заказы выбираются по id ИЗ НЕЁ. Параметры запроса для него игнорируются:
  // подставить чужой id больше нечем. Свободные фильтры остаются у админки
  // (isStaff) и у витринного бота (requireBotAuth) — им они нужны по делу.
  const customerId = getCustomerId(request);
  const privileged = isStaff(request) || requireBotAuth(request);

  if (customerId) {
    userId = customerId;
    phone = null;
    telegramId = null;
  } else if (!privileged) {
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
    // Второй рубеж после middleware. Его здесь не было вовсе: смена статуса и
    // статуса ОПЛАТЫ держалась на одном правиле в таблице префиксов, и любая
    // ошибка в нём — переименование пути, новый matcher — открыла бы ручку,
    // которая помечает заказы оплаченными. Соседний `/api/admin/orders/[id]`
    // свой рубеж имеет, этот был исключением.
    if (!isAuthorized(request) && !requireBotAuth(request)) return unauthorized();

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

    publish('orders');
    return NextResponse.json({ success: true, order });
  } catch (error) {
    console.error('Order update error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { z } from 'zod';

// ══════════════════════════════════════════════════════════════════
// API: /api/subscriptions
// CRUD для подписки «Зелёная Коробка»
// ══════════════════════════════════════════════════════════════════

const createSchema = z.object({
  userId: z.string(),
  interval: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']).default('WEEKLY'),
  deliveryDay: z.number().min(0).max(6).default(1),
  address: z.string().min(2),
  phone: z.string().min(5),
  city: z.string().default('tashkent'),
  note: z.string().optional(),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().min(1).default(1),
  })).min(1),
});

const updateSchema = z.object({
  subscriptionId: z.string(),
  action: z.enum(['pause', 'resume', 'cancel', 'update']),
  interval: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']).optional(),
  deliveryDay: z.number().min(0).max(6).optional(),
  address: z.string().min(2).optional(),
  phone: z.string().min(5).optional(),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().min(1).default(1),
  })).optional(),
});

function nextDeliveryDate(deliveryDay: number, interval: string): Date {
  const now = new Date();
  const currentDay = now.getDay(); // 0=Sun, but we use 0=Mon
  // Convert our Monday-based to JS Sunday-based
  const jsDayTarget = (deliveryDay + 1) % 7;
  let daysUntil = jsDayTarget - currentDay;
  if (daysUntil <= 0) daysUntil += 7;

  const intervalDays = interval === 'MONTHLY' ? 28 : interval === 'BIWEEKLY' ? 14 : 7;
  if (daysUntil < 2) daysUntil += intervalDays; // Минимум 2 дня до первой доставки

  const next = new Date(now);
  next.setDate(next.getDate() + daysUntil);
  next.setHours(0, 0, 0, 0);
  return next;
}

// GET — список подписок пользователя
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const subscriptions = await prisma.greenBoxSubscription.findMany({
    where: { userId },
    include: {
      items: {
        include: { product: { select: { id: true, nameUz: true, nameRu: true, price: true, images: true, slug: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ subscriptions });
}

// POST — создание или обновление подписки
export async function POST(req: NextRequest) {
  const body = await req.json();

  // Обновление существующей подписки
  if (body.subscriptionId) {
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { subscriptionId, action, ...updates } = parsed.data;

    const existing = await prisma.greenBoxSubscription.findUnique({ where: { id: subscriptionId } });
    if (!existing) {
      return NextResponse.json({ error: 'Подписка не найдена' }, { status: 404 });
    }

    if (action === 'pause') {
      const sub = await prisma.greenBoxSubscription.update({
        where: { id: subscriptionId },
        data: { status: 'PAUSED', pausedAt: new Date() },
      });
      return NextResponse.json({ success: true, subscription: sub });
    }

    if (action === 'resume') {
      const sub = await prisma.greenBoxSubscription.update({
        where: { id: subscriptionId },
        data: {
          status: 'ACTIVE',
          pausedAt: null,
          nextDelivery: nextDeliveryDate(existing.deliveryDay, existing.interval),
        },
      });
      return NextResponse.json({ success: true, subscription: sub });
    }

    if (action === 'cancel') {
      const sub = await prisma.greenBoxSubscription.update({
        where: { id: subscriptionId },
        data: { status: 'CANCELLED' },
      });
      return NextResponse.json({ success: true, subscription: sub });
    }

    // action === 'update' — обновить состав и параметры
    const updateData: Record<string, unknown> = {};
    if (updates.interval) updateData.interval = updates.interval;
    if (updates.deliveryDay !== undefined) updateData.deliveryDay = updates.deliveryDay;
    if (updates.address) updateData.address = updates.address;
    if (updates.phone) updateData.phone = updates.phone;

    if (updates.items) {
      // Пересоздаём состав подписки атомарно
      await prisma.$transaction([
        prisma.greenBoxItem.deleteMany({ where: { subscriptionId } }),
        ...updates.items.map(item =>
          prisma.greenBoxItem.create({
            data: { subscriptionId, productId: item.productId, quantity: item.quantity },
          }),
        ),
      ]);

      // Пересчитываем сумму
      const products = await prisma.product.findMany({
        where: { id: { in: updates.items.map(i => i.productId) } },
        select: { id: true, price: true },
      });
      const priceMap = new Map(products.map(p => [p.id, p.price]));
      const total = updates.items.reduce((sum, i) => sum + (priceMap.get(i.productId) || 0) * i.quantity, 0);
      updateData.total = total;
    }

    if (updates.interval || updates.deliveryDay !== undefined) {
      updateData.nextDelivery = nextDeliveryDate(
        updates.deliveryDay ?? existing.deliveryDay,
        updates.interval ?? existing.interval,
      );
    }

    const sub = await prisma.greenBoxSubscription.update({
      where: { id: subscriptionId },
      data: updateData,
      include: { items: { include: { product: { select: { id: true, nameUz: true, nameRu: true, price: true } } } } },
    });

    return NextResponse.json({ success: true, subscription: sub });
  }

  // Создание новой подписки
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const data = parsed.data;

  // Проверяем, что пользователь существует
  const user = await prisma.user.findUnique({ where: { id: data.userId } });
  if (!user) {
    return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
  }

  // Получаем цены продуктов для расчёта суммы
  const products = await prisma.product.findMany({
    where: { id: { in: data.items.map(i => i.productId) } },
    select: { id: true, price: true },
  });
  const priceMap = new Map(products.map(p => [p.id, p.price]));
  const total = data.items.reduce((sum, i) => sum + (priceMap.get(i.productId) || 0) * i.quantity, 0);

  const subscription = await prisma.greenBoxSubscription.create({
    data: {
      userId: data.userId,
      interval: data.interval,
      deliveryDay: data.deliveryDay,
      address: data.address,
      phone: data.phone,
      city: data.city,
      note: data.note,
      total,
      nextDelivery: nextDeliveryDate(data.deliveryDay, data.interval),
      items: {
        create: data.items.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
      },
    },
    include: {
      items: { include: { product: { select: { id: true, nameUz: true, nameRu: true, price: true } } } },
    },
  });

  return NextResponse.json({ success: true, subscription });
}

import { prisma } from '@repo/database';
import { deliveryFeeForSubtotal, getNumber } from '@/lib/settings/store';
import { validatePromo, consumePromo } from '@/lib/promo';
import { generateOrderNumber } from './notify';
import type { orderSchema, OrderItemInput } from './schema';
import type { z } from 'zod';

// ══════════════════════════════════════════════════════════════════════
// Создание заказа. Вынесено из api/orders/route.ts дословно: здесь живёт
// конкурентность оформления — условное списание бонусов и upsert клиента
// по телефону, — и переписывать её рефакторингом нельзя.
//
// Отказ возвращается значением, а не исключением: роут превращает его в
// HTTP-ответ, а все причины отказа видны в одном месте.
// ══════════════════════════════════════════════════════════════════════

type OrderBody = z.infer<typeof orderSchema>;

type CreatedOrder = Awaited<ReturnType<typeof prisma.order.create>> & {
  items: { productId: string; quantity: number; price: number; product: { nameUz: string } }[];
};

export type CreateOrderResult =
  | { ok: true; order: CreatedOrder; user: Awaited<ReturnType<typeof prisma.user.upsert>>; customerName: string }
  | { ok: false; error: string; status: number };

export async function createOrder(body: OrderBody): Promise<CreateOrderResult> {
  // ── Bot compatibility layer ─────────────────────────────
  // The Telegram bot sends a flat format:
  //   { name, phone, address, items: [{ id, title, price, quantity }], source, telegramId }
  // The web storefront sends:
  //   { customer: { firstName, phone, address }, items: [{ productId, price, quantity }], city }
  // Detect bot format (has `name` string at top level instead of `customer` object)
  // and normalise before the rest of the handler runs.
  let { customer, items, paymentMethod, userId } = body;
  const { bonusToUse, city } = body;

  if (typeof body.name === 'string' && !customer) {
    // Bot format → normalise to web format
    customer = {
      firstName: body.name,
      phone: body.phone || '',
      address: body.address || 'Telegram bot orqali',
    };
    // Map bot item shape: { id → productId }
    items = (body.items || []).map((item: OrderItemInput) => ({
      productId: item.productId || item.id || '',
      price: item.price,
      quantity: item.quantity,
    }));
    paymentMethod = body.paymentMethod || 'cash';

    // If bot sent a telegramId, resolve the user from it
    if (body.telegramId && !userId) {
      const tgUser = await prisma.user.findUnique({
        where: { telegramId: BigInt(body.telegramId) },
      });
      if (tgUser) userId = tgUser.id;
    }
  }

  // Validate
  if (!customer?.firstName || !customer?.phone || !customer?.address) {
    return { ok: false, error: "Shaxsiy ma'lumotlar to'liq emas", status: 400 };
  }
  if (!items || items.length === 0) {
    return { ok: false, error: "Savat bo'sh", status: 400 };
  }

  const subtotal = items.reduce((sum: number, item: { price: number; quantity: number }) => sum + item.price * item.quantity, 0);
  const deliveryFee = await deliveryFeeForSubtotal(subtotal);

  // Resolve the ordering user: prefer the logged-in account (userId), then
  // phone, else create a guest by phone.
  let user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
  if (!user) {
    // Atomic upsert by phone — two concurrent first-time orders sharing a phone
    // would otherwise both miss findUnique and both create → unique-violation 500.
    user = await prisma.user.upsert({
      where: { phone: customer.phone },
      update: {},
      create: {
        phone: customer.phone,
        firstName: customer.firstName,
        lastName: customer.lastName || null,
      },
    });
  }

  // Bonus redemption — only for the authenticated account, capped by the
  // balance and by the goods subtotal (delivery is never covered by points).
  // Порог списания брался из настроек: клиенту его показывали в
  // /api/referral ("minCashout: 50000"), но при оформлении не проверяли —
  // списать можно было с любого баланса. Теперь обещание и поведение
  // совпадают; чтобы вернуть прежнюю вольницу, поставьте порог в 0.
  const minCashout = await getNumber('bonus.minCashout');
  const authed = !!userId && user.id === userId;
  let bonusApplied = authed && user.bonusPoints >= minCashout
    ? Math.max(0, Math.min(Math.floor(Number(bonusToUse) || 0), user.bonusPoints, subtotal))
    : 0;

  // Promo code — authoritative re-validation on submit (client preview via
  // /api/promo is advisory only). Capped by the goods subtotal minus bonus.
  let promoApplied = 0;
  const promoCode = body.promoCode ? String(body.promoCode).trim().toUpperCase() : null;
  if (promoCode) {
    const promoResult = await validatePromo(promoCode, subtotal);
    if (!promoResult.valid) {
      return { ok: false, error: promoResult.error ?? "Promokod rad etildi", status: 422 };
    }
    promoApplied = Math.min(promoResult.discount, subtotal - bonusApplied);
  }

  // Reserve bonus points + create the order ATOMICALLY (single transaction):
  //  • the reservation is a CONDITIONAL decrement, so two concurrent orders from
  //    the same account can't double-spend the same balance (TOCTOU-safe);
  //  • a failure mid-flight never debits points without creating the order.
  const order = await prisma.$transaction(async (tx) => {
    if (bonusApplied > 0) {
      const reserved = await tx.user.updateMany({
        where: { id: user!.id, bonusPoints: { gte: bonusApplied } },
        data: { bonusPoints: { decrement: bonusApplied } },
      });
      // Balance changed under us (another concurrent order spent it) → don't apply.
      if (reserved.count === 0) bonusApplied = 0;
    }
    return tx.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        userId: user!.id,
        status: 'PENDING',
        subtotal,
        deliveryFee,
        total: subtotal + deliveryFee - bonusApplied - promoApplied,
        discount: bonusApplied + promoApplied,
        // Раскладка скидки. Без неё отменённый заказ не мог вернуть ни баллы,
        // ни использование промокода: из общей суммы одно от другого не
        // отделить, и клиент терял баллы навсегда.
        bonusUsed: bonusApplied,
        promoCode: promoApplied > 0 ? promoCode : null,
        city: city || 'tashkent',
        address: customer!.address,
        phone: customer!.phone,
        note: customer!.note || null,
        paymentMethod: paymentMethod || 'cash',
        isSubscription: body.isSubscription || false,
        paymentStatus: 'PENDING',
        items: {
          create: items!.map((item: OrderItemInput) => ({
            productId: item.productId || item.id || '',
            quantity: item.quantity,
            price: item.price,
          })),
        },
      },
      include: {
        items: { include: { product: { select: { nameUz: true } } } },
      },
    });
  });

  // Count the promo use
  if (promoCode && promoApplied > 0) {
    await consumePromo(promoCode);
  }

  return { ok: true, order, user, customerName: customer.firstName };
}

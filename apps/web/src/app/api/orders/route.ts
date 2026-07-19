import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { deliveryFeeFor } from '@/lib/site';
import { syncOrderStatus } from '@/lib/orderSync';
import { validatePromo, consumePromo } from '@/lib/promo';
import { z } from 'zod';

// ==========================================
// Orders API — Create & List (Prisma-backed)
// ==========================================

// Generate order number
function generateOrderNumber(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `M-${date}-${rand}`;
}

// Helper to send message to Telegram Admin
async function notifyTelegram(order: {
  orderNumber: string;
  phone: string;
  address: string;
  note: string | null;
  total: number;
  deliveryFee: number;
  paymentMethod: string;
  items: { quantity: number; price: number; product: { nameUz: string } }[];
}, customerName: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const adminChatId = process.env.ADMIN_CHAT_ID;

  if (!token || !adminChatId) {
    console.warn('Telegram notification skipped: Missing TELEGRAM_BOT_TOKEN or ADMIN_CHAT_ID in .env');
    return;
  }

  const itemsList = order.items.map(i => `▫️ ${i.quantity}x ${i.product.nameUz} — ${i.price.toLocaleString('ru-RU')} sum`).join('\n');
  const message = `
🛍 <b>Yangi buyurtma: #${order.orderNumber}</b>

👤 <b>Mijoz:</b> ${customerName}
📞 <b>Telefon:</b> ${order.phone}
📍 <b>Manzil:</b> ${order.address}
📝 <b>Izoh:</b> ${order.note || 'Yoq'}

📦 <b>Mahsulotlar:</b>
${itemsList}

💰 <b>Yetkazib berish:</b> ${order.deliveryFee.toLocaleString('ru-RU')} sum
💳 <b>To'lov usuli:</b> ${order.paymentMethod === 'cash' ? '💳 Naqd/Otkazma' : order.paymentMethod}
💵 <b>Umumiy summa: ${order.total.toLocaleString('ru-RU')} sum</b>
  `;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: adminChatId,
        text: message,
        parse_mode: 'HTML'
      })
    });
  } catch (err) {
    console.error('Failed to send telegram notification', err);
  }
}

// Bridge the order into the tgas AI-office CRM (a separate `microgreen` DB).
// The storefront and the AI-office live in different databases, so without this
// hop Stepan and the department bots never see app orders. The web_office ingest
// endpoint mirrors the order into the CRM and fires ORDER_CREATED on the internal
// event bus. Best-effort: a failure here must not fail the customer's checkout.
async function notifyOffice(
  order: {
    orderNumber: string;
    phone: string;
    address: string;
    note: string | null;
    total: number;
    deliveryFee: number;
    discount: number;
    paymentMethod: string;
    city: string;
    items: { productId: string; quantity: number; price: number; product: { nameUz: string } }[];
  },
  user: { firstName: string | null; lastName: string | null; telegramId: bigint | null; bonusPoints: number },
) {
  const url = process.env.OFFICE_INGEST_URL; // e.g. http://web_office:8050/ingest/order
  if (!url) {
    console.warn('AI-office ingest skipped: OFFICE_INGEST_URL not set');
    return;
  }

  const itemsSummary = order.items
    .map((i) => `${i.product.nameUz} x${i.quantity}`)
    .join(', ');
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || null;

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.INGEST_SECRET ? { 'X-Ingest-Secret': process.env.INGEST_SECRET } : {}),
        },
        body: JSON.stringify({
          order_number: order.orderNumber,
          customer: {
            name,
            phone: order.phone,
            telegram_id: user.telegramId ? user.telegramId.toString() : null,
            bonus_balance: user.bonusPoints,
          },
          total_amount: order.total,
          delivery_fee: order.deliveryFee,
          discount_amount: order.discount,
          payment_method: order.paymentMethod,
          delivery_address: order.address,
          city: order.city,
          items_summary: itemsSummary,
          items: order.items.map((i) => ({
            storefront_id: i.productId,
            name: i.product.nameUz,
            quantity: i.quantity,
            price: i.price,
          })),
          notes: order.note || '',
        }),
        signal: AbortSignal.timeout(4000),
      });

      if (!response.ok) {
        throw new Error(`Office CRM returned status ${response.status}`);
      }
      return; // Success
    } catch (err) {
      if (attempt === maxRetries) {
        console.error('AI-office ingest failed after 3 attempts (order still created):', err);
      } else {
        console.warn(`AI-office ingest attempt ${attempt} failed, retrying in 2s...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }
}

const orderItemSchema = z.object({
  id: z.string().optional(),
  productId: z.string().optional(),
  title: z.string().optional(),
  price: z.number().min(0),
  quantity: z.number().min(1),
});

const orderSchema = z.object({
  customer: z.object({
    firstName: z.string().min(1),
    lastName: z.string().optional().nullable(),
    phone: z.string().min(5),
    address: z.string().min(2),
    note: z.string().optional().nullable(),
  }).optional(),
  items: z.array(orderItemSchema).optional(),
  paymentMethod: z.string().optional(),
  userId: z.string().optional().nullable(),
  bonusToUse: z.union([z.number(), z.string()]).optional(),
  promoCode: z.string().optional().nullable(),
  name: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  telegramId: z.union([z.number(), z.string(), z.bigint()]).optional(),
});

// POST — Create order
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const parseResult = orderSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return NextResponse.json({ error: "Noto'g'ri ma'lumot formati", details: parseResult.error.issues }, { status: 400 });
    }
    const body = parseResult.data;

    // ── Bot compatibility layer ─────────────────────────────
    // The Telegram bot sends a flat format:
    //   { name, phone, address, items: [{ id, title, price, quantity }], source, telegramId }
    // The web storefront sends:
    //   { customer: { firstName, phone, address }, items: [{ productId, price, quantity }], city }
    // Detect bot format (has `name` string at top level instead of `customer` object)
    // and normalise before the rest of the handler runs.
    let { customer, items, paymentMethod, userId, bonusToUse, city } = body;

    if (typeof body.name === 'string' && !customer) {
      // Bot format → normalise to web format
      customer = {
        firstName: body.name,
        phone: body.phone || '',
        address: body.address || 'Telegram bot orqali',
      };
      // Map bot item shape: { id → productId }
      items = (body.items || []).map((item: any) => ({
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
      return NextResponse.json({ error: "Shaxsiy ma'lumotlar to'liq emas" }, { status: 400 });
    }
    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Savat bo'sh" }, { status: 400 });
    }

    const subtotal = items.reduce((sum: number, item: { price: number; quantity: number }) => sum + item.price * item.quantity, 0);
    const deliveryFee = deliveryFeeFor(subtotal);

    // Resolve the ordering user: prefer the logged-in account (userId), then
    // phone, else create a guest by phone.
    let user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
    if (!user) user = await prisma.user.findUnique({ where: { phone: customer.phone } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          phone: customer.phone,
          firstName: customer.firstName,
          lastName: customer.lastName || null,
        },
      });
    }

    // Bonus redemption — only for the authenticated account, capped by the
    // balance and by the goods subtotal (delivery is never covered by points).
    const authed = !!userId && user.id === userId;
    const bonusApplied = authed
      ? Math.max(0, Math.min(Math.floor(Number(bonusToUse) || 0), user.bonusPoints, subtotal))
      : 0;

    // Promo code — authoritative re-validation on submit (client preview via
    // /api/promo is advisory only). Capped by the goods subtotal minus bonus.
    let promoApplied = 0;
    const promoCode = body.promoCode ? String(body.promoCode).trim().toUpperCase() : null;
    if (promoCode) {
      const promoResult = await validatePromo(promoCode, subtotal);
      if (!promoResult.valid) {
        return NextResponse.json({ error: promoResult.error }, { status: 422 });
      }
      promoApplied = Math.min(promoResult.discount, subtotal - bonusApplied);
    }

    // Create order with items in a transaction
    const order = await prisma.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        userId: user.id,
        status: 'PENDING',
        subtotal,
        deliveryFee,
        total: subtotal + deliveryFee - bonusApplied - promoApplied,
        discount: bonusApplied + promoApplied,
        city: city || 'tashkent',
        address: customer.address,
        phone: customer.phone,
        note: customer.note || null,
        paymentMethod: paymentMethod || 'cash',
        paymentStatus: 'PENDING',
        items: {
          create: items.map((item: any) => ({
            productId: item.productId || item.id || '',
            quantity: item.quantity,
            price: item.price,
          })),
        },
      },
      include: {
        items: {
          include: {
            product: { select: { nameUz: true } },
          },
        },
      },
    });

    // Deduct redeemed bonus points from the account
    if (bonusApplied > 0) {
      try {
        await prisma.user.update({ where: { id: user.id }, data: { bonusPoints: { decrement: bonusApplied } } });
      } catch (e) { console.error('Bonus deduction error:', e); }
    }

    // Count the promo use
    if (promoCode && promoApplied > 0) {
      await consumePromo(promoCode);
    }

    // Auto-deduct stock + create StockMovements
    const lowStockAlerts: string[] = [];
    try {
      for (const item of order.items) {
        const [, updatedProduct] = await prisma.$transaction([
          prisma.stockMovement.create({
            data: {
              productId: item.productId,
              type: 'OUT',
              quantity: -item.quantity,
              reason: `Online buyurtma #${order.orderNumber}`,
              orderId: order.id,
              performedBy: 'System',
            },
          }),
          prisma.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: item.quantity } },
          }),
        ]);
        if (updatedProduct.stock <= 5) {
          lowStockAlerts.push(`⚠️ ${item.product.nameUz} — faqat ${updatedProduct.stock} dona qoldi!`);
        }
      }
    } catch (stockErr) {
      console.error('Stock deduction error (order still created):', stockErr);
    }

    // Send low-stock alerts to Telegram
    if (lowStockAlerts.length > 0) {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const adminChatId = process.env.ADMIN_CHAT_ID;
      if (token && adminChatId) {
        const alertMsg = `🔴 <b>Kam qolgan tovarlar!</b>\n\n${lowStockAlerts.join('\n')}\n\n📦 Buyurtma: #${order.orderNumber}`;
        try {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: adminChatId, text: alertMsg, parse_mode: 'HTML' }),
          });
        } catch (e) { console.error('Low stock alert error:', e); }
      }
    }

    // Send notification to Telegram bot
    await notifyTelegram(order, customer.firstName);

    // Mirror into the AI-office CRM + fire ORDER_CREATED so Stepan and the
    // department bots (Finance/PM/Analytics) actually see this order.
    // Run in background without awaiting to ensure fast checkout for the user.
    notifyOffice(order, user).catch(console.error);


    // Referral bonus: 3% to referrer
    try {
      if (user.referredBy) {
        const referrer = await prisma.user.findFirst({
          where: { referralCode: user.referredBy },
        });
        if (referrer) {
          const bonus = Math.round(order.total * 0.03); // 3%
          await prisma.user.update({
            where: { id: referrer.id },
            data: { bonusPoints: { increment: bonus } },
          });
          console.log(`Referral bonus: +${bonus} to ${referrer.firstName} (from order ${order.orderNumber})`);
        }
      }
    } catch (refErr) {
      console.error('Referral bonus error:', refErr);
    }

    return NextResponse.json({
      success: true,
      order: {
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

  const where: any = status && status !== 'ALL' ? { status: status as any } : {};
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

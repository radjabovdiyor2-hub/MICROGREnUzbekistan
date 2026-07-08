import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { deliveryFeeFor } from '@/lib/site';
import { syncOrderStatus } from '@/lib/orderSync';

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

  try {
    await fetch(url, {
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
          // BigInt is not JSON-serializable — send as a decimal string.
          telegram_id: user.telegramId ? user.telegramId.toString() : null,
          // Mirror the loyalty balance so the office CRM shows one number.
          bonus_balance: user.bonusPoints,
        },
        total_amount: order.total,
        delivery_fee: order.deliveryFee,
        discount_amount: order.discount,
        payment_method: order.paymentMethod,
        delivery_address: order.address,
        items_summary: itemsSummary,
        // Per-line detail so the office can write order_items against the
        // synced catalog (product matched by storefront_id).
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
  } catch (err) {
    console.error('AI-office ingest failed (order still created):', err);
  }
}

// POST — Create order
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customer, items, paymentMethod, userId, bonusToUse } = body;

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

    // Create order with items in a transaction
    const order = await prisma.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        userId: user.id,
        status: 'PENDING',
        subtotal,
        deliveryFee,
        total: subtotal + deliveryFee - bonusApplied,
        discount: bonusApplied,
        address: customer.address,
        phone: customer.phone,
        note: customer.note || null,
        paymentMethod: paymentMethod || 'cash',
        paymentStatus: 'PENDING',
        items: {
          create: items.map((item: { productId: string; price: number; quantity: number }) => ({
            productId: item.productId,
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
    await notifyOffice(order, user);


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

  const where: any = status && status !== 'ALL' ? { status: status as any } : {};
  if (phone) where.phone = phone;
  if (userId) where.userId = userId;

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

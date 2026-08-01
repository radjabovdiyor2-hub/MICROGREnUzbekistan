import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import { prisma, Prisma } from '@repo/database';

// ══════════════════════════════════════════════════════════════════════
// Продажа в магазине. Вынесено из api/inventory/pos/route.ts: файл
// перерос 200 строк, а в route.ts Next.js разрешает экспортировать
// только HTTP-обработчики. Логика перенесена дословно — здесь списание
// остатков и запись долга, трогать это рефакторингом нельзя.
// ══════════════════════════════════════════════════════════════════════

/** Возвращает готовый ответ: коды статусов у отказов различаются по причине. */
export async function processSale(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();
  const { items, paymentMethod, performedBy, debtInfo } = body;
  // items: [{ productId, quantity, price }]
  // paymentMethod: 'cash' | 'card' | 'debt'
  // performedBy: employee name or "Egasi"
  // debtInfo: { personName, phone, dueDate, description } (only if paymentMethod === 'debt')

  if (!items || items.length === 0) {
    return NextResponse.json({ error: "Tovarlar ro'yxati bo'sh" }, { status: 400 });
  }

  // Validate all items have enough stock
  const productIds = items.map((i: { productId: string }) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, nameUz: true, stock: true, price: true, costPrice: true },
  });

  const productMap = new Map(products.map(p => [p.id, p]));

  for (const item of items as { productId: string; quantity: number }[]) {
    const product = productMap.get(item.productId);
    if (!product) {
      return NextResponse.json({ error: `Tovar topilmadi: ${item.productId}` }, { status: 404 });
    }
    if (product.stock < item.quantity) {
      return NextResponse.json({
        error: `${product.nameUz}: omborda ${product.stock} dona, ${item.quantity} dona so'ralmoqda`,
      }, { status: 400 });
    }
  }

  // Calculate total
  const total = (items as { productId: string; quantity: number; price: number }[])
    .reduce((sum, item) => sum + item.price * item.quantity, 0);

  // Generate sale number
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  const saleNumber = `S-${dateStr}-${rand}`;

  // Execute all operations in a single transaction
  const operations: Prisma.PrismaPromise<unknown>[] = [];

  // 1. Create StockMovement for each item + update stock
  for (const item of items as { productId: string; quantity: number; price: number }[]) {
    operations.push(
      prisma.stockMovement.create({
        data: {
          productId: item.productId,
          type: 'OUT',
          quantity: -Math.abs(item.quantity),
          reason: paymentMethod === 'debt'
            ? `Qarzga sotish — ${debtInfo?.personName || 'Nomalum'} (${saleNumber})`
            : `Do'kon sotish (${saleNumber})`,
          performedBy: performedBy || 'Egasi',
          costPrice: productMap.get(item.productId)?.costPrice || null,
          salePrice: item.price, // actual sale price (may differ from product.price)
        },
      })
    );

    const product = productMap.get(item.productId)!;
    operations.push(
      prisma.product.update({
        where: { id: item.productId },
        data: { stock: product.stock - item.quantity },
      })
    );
  }

  // 2. If debt sale, create Debt record
  if (paymentMethod === 'debt' && debtInfo) {
    operations.push(
      prisma.debt.create({
        data: {
          type: 'WHO_OWES_US',
          personName: debtInfo.personName,
          phone: debtInfo.phone || null,
          amount: total,
          paidAmount: 0,
          description: `Do'kon sotish ${saleNumber}: ${(items as { productId: string; quantity: number }[]).map(i => {
            const p = productMap.get(i.productId);
            return `${p?.nameUz} × ${i.quantity}`;
          }).join(', ')}`,
          dueDate: debtInfo.dueDate ? new Date(debtInfo.dueDate) : null,
          isPaid: false,
        },
      })
    );
  }

  await prisma.$transaction(operations);

  // Check for low stock alerts
  const alerts: { productName: string; stock: number; level: string }[] = [];
  for (const item of items as { productId: string; quantity: number }[]) {
    const product = productMap.get(item.productId)!;
    const newStock = product.stock - item.quantity;
    if (newStock <= 5) {
      alerts.push({
        productName: product.nameUz,
        stock: newStock,
        level: newStock <= 2 ? 'CRITICAL' : 'WARNING',
      });
    }
  }

  // === Send Telegram notification to admin (fire-and-forget) ===
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
  if (BOT_TOKEN && ADMIN_CHAT_ID) {
    const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');
    const payLabel = paymentMethod === 'cash' ? '💵 Naqd' : paymentMethod === 'card' ? '💳 Karta' : '📝 Qarz';

    let msg = `💰 *SOTISH #${saleNumber}*\n\n`;
    msg += `👤 ${performedBy || 'Egasi'} | ${payLabel}\n`;
    msg += `🕐 ${now.toLocaleString('uz-UZ', { timeZone: 'Asia/Samarkand', hour: '2-digit', minute: '2-digit' })}\n\n`;

    for (const item of items as { productId: string; quantity: number; price: number }[]) {
      const p = productMap.get(item.productId)!;
      msg += `• ${p.nameUz} × ${item.quantity} = ${fmt(item.price * item.quantity)}\n`;
    }

    msg += `\n*JAMI: ${fmt(total)} so'm*`;

    if (alerts.length > 0) {
      msg += `\n\n⚠️ *Kam qoldi:*\n`;
      for (const a of alerts) {
        msg += `${a.level === 'CRITICAL' ? '🔴' : '🟡'} ${a.productName} — ${a.stock} dona\n`;
      }
    }

    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text: msg, parse_mode: 'Markdown' }),
    }).catch(() => {});
  }

  return NextResponse.json({
    success: true,
    saleNumber,
    total,
    itemCount: items.length,
    paymentMethod,
    performedBy: performedBy || 'Egasi',
    alerts,
    createdAt: now.toISOString(),
  });
}

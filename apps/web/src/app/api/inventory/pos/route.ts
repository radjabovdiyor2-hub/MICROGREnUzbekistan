import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';

// ==========================================
// POS (Point of Sale) — Quick Store Sales
// ==========================================

// POST — Process a store sale (multiple items at once)
export async function POST(request: NextRequest) {
  try {
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
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    const saleNumber = `S-${dateStr}-${rand}`;

    // Execute all operations in a single transaction
    const operations: unknown[] = [];

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

    await prisma.$transaction(operations as any);

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
  } catch (error) {
    console.error('POS sale error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

// PUT — Process a product return
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { items, reason, performedBy } = body;
    // items: [{ productId, quantity, price }]
    // reason: string (return reason)
    // performedBy: employee name

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Qaytarish ro'yxati bo'sh" }, { status: 400 });
    }

    // Validate products exist
    const productIds = items.map((i: { productId: string }) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, nameUz: true, stock: true, price: true },
    });
    const productMap = new Map(products.map(p => [p.id, p]));

    for (const item of items as { productId: string; quantity: number }[]) {
      if (!productMap.has(item.productId)) {
        return NextResponse.json({ error: `Tovar topilmadi: ${item.productId}` }, { status: 404 });
      }
    }

    // Calculate total refund
    const totalRefund = (items as { productId: string; quantity: number; price: number }[])
      .reduce((sum, item) => sum + item.price * item.quantity, 0);

    // Generate return number
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    const returnNumber = `R-${dateStr}-${rand}`;

    // Execute return in a transaction
    const operations: unknown[] = [];

    for (const item of items as { productId: string; quantity: number; price: number }[]) {
      // Create RETURN stock movement (IN type, positive quantity)
      operations.push(
        prisma.stockMovement.create({
          data: {
            productId: item.productId,
            type: 'IN',
            quantity: Math.abs(item.quantity),
            reason: `Qaytarish (${returnNumber}): ${reason || "Sabab ko'rsatilmagan"}`,
            performedBy: performedBy || 'Egasi',
            costPrice: null,
          },
        })
      );

      // Restore stock
      const product = productMap.get(item.productId)!;
      operations.push(
        prisma.product.update({
          where: { id: item.productId },
          data: { stock: product.stock + item.quantity },
        })
      );
    }

    await prisma.$transaction(operations as any);

    // Send Telegram notification to admin (fire-and-forget)
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
    if (BOT_TOKEN && ADMIN_CHAT_ID) {
      const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

      let msg = `🔄 *QAYTARISH #${returnNumber}*\n\n`;
      msg += `👤 ${performedBy || 'Egasi'}\n`;
      msg += `🕐 ${now.toLocaleString('uz-UZ', { timeZone: 'Asia/Samarkand', hour: '2-digit', minute: '2-digit' })}\n`;
      msg += `📝 ${reason || "Sabab ko'rsatilmagan"}\n\n`;

      for (const item of items as { productId: string; quantity: number; price: number }[]) {
        const p = productMap.get(item.productId)!;
        msg += `• ${p.nameUz} × ${item.quantity} = ${fmt(item.price * item.quantity)}\n`;
      }

      msg += `\n*QAYTARILDI: ${fmt(totalRefund)} so'm*`;

      fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text: msg, parse_mode: 'Markdown' }),
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      returnNumber,
      totalRefund,
      itemCount: items.length,
      performedBy: performedBy || 'Egasi',
      createdAt: now.toISOString(),
    });
  } catch (error) {
    console.error('POS return error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const seller = searchParams.get('seller');
  const date = searchParams.get('date') || new Date().toISOString().slice(0, 10);

  const startOfDay = new Date(`${date}T00:00:00.000Z`);
  const endOfDay = new Date(`${date}T23:59:59.999Z`);

  const where: Record<string, unknown> = {
    type: 'OUT',
    reason: { startsWith: "Do'kon sotish" },
    createdAt: { gte: startOfDay, lte: endOfDay },
  };

  if (seller) {
    where.performedBy = seller;
  }

  const movements = await prisma.stockMovement.findMany({
    where,
    include: {
      product: { select: { nameUz: true, nameRu: true, price: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Get returns for same period
  const returnWhere: Record<string, unknown> = {
    type: 'IN',
    reason: { startsWith: 'Qaytarish' },
    createdAt: { gte: startOfDay, lte: endOfDay },
  };
  if (seller) {
    returnWhere.performedBy = seller;
  }

  const returnMovements = await prisma.stockMovement.findMany({
    where: returnWhere,
    include: {
      product: { select: { nameUz: true, nameRu: true, price: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Group sales by sale number
  const salesMap = new Map<string, { items: typeof movements; total: number; time: string }>();

  for (const m of movements) {
    const match = m.reason?.match(/\(S-[A-Z0-9-]+\)/);
    const saleNum = match ? match[0].replace(/[()]/g, '') : 'unknown';

    if (!salesMap.has(saleNum)) {
      salesMap.set(saleNum, { items: [], total: 0, time: m.createdAt.toISOString() });
    }
    const sale = salesMap.get(saleNum)!;
    sale.items.push(m);
    sale.total += Math.abs(m.quantity) * (m.salePrice || m.product.price);
  }

  // Group returns by return number
  const returnsMap = new Map<string, { items: typeof returnMovements; total: number; time: string }>();
  for (const m of returnMovements) {
    const match = m.reason?.match(/\(R-[A-Z0-9-]+\)/);
    const retNum = match ? match[0].replace(/[()]/g, '') : 'unknown';

    if (!returnsMap.has(retNum)) {
      returnsMap.set(retNum, { items: [], total: 0, time: m.createdAt.toISOString() });
    }
    const ret = returnsMap.get(retNum)!;
    ret.items.push(m);
    ret.total += Math.abs(m.quantity) * (m.salePrice || m.product.price);
  }

  const sales = Array.from(salesMap.entries()).map(([number, data]) => ({
    number, ...data, itemCount: data.items.length, type: 'sale' as const,
  }));

  const returns = Array.from(returnsMap.entries()).map(([number, data]) => ({
    number, ...data, itemCount: data.items.length, type: 'return' as const,
  }));

  const grossRevenue = sales.reduce((s, sale) => s + sale.total, 0);
  const totalReturns = returns.reduce((s, ret) => s + ret.total, 0);
  const totalRevenue = grossRevenue - totalReturns;
  const totalItems = movements.length;

  return NextResponse.json({
    date,
    seller: seller || 'Barchasi',
    sales,
    returns,
    summary: {
      totalSales: sales.length,
      totalReturns: returns.length,
      totalItems,
      grossRevenue,
      totalReturnAmount: totalReturns,
      totalRevenue, // net revenue (after returns)
    },
  });
}

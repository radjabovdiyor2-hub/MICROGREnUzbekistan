import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';

// ==========================================
// Stock Movements API — Inventory Operations
// ==========================================

// GET — List stock movements with filters
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get('productId');
  const type = searchParams.get('type');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const limit = parseInt(searchParams.get('limit') || '50');
  const page = parseInt(searchParams.get('page') || '1');

  const where: Record<string, unknown> = {};

  if (productId) where.productId = productId;
  if (type) where.type = type;
  if (from || to) {
    where.createdAt = {};
    if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from);
    if (to) (where.createdAt as Record<string, unknown>).lte = new Date(to);
  }

  const [movements, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      include: {
        product: { select: { nameUz: true, nameRu: true, price: true, stock: true } },
        supplier: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.stockMovement.count({ where }),
  ]);

  return NextResponse.json({ movements, total, page, totalPages: Math.ceil(total / limit) });
}

// POST — Create stock movement (handles all types including POS sales)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { productId, type, quantity, reason, note, supplierId, costPrice, performedBy, orderId } = body;

    // Validate
    if (!productId || !type || !quantity) {
      return NextResponse.json({ error: "productId, type, quantity majburiy" }, { status: 400 });
    }

    const validTypes = ['IN', 'OUT', 'ADJUSTMENT', 'RETURN', 'WRITE_OFF'];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: `Noto'g'ri type: ${type}` }, { status: 400 });
    }

    // Check product exists
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return NextResponse.json({ error: "Tovar topilmadi" }, { status: 404 });
    }

    // Calculate new stock
    let stockChange = 0;
    let newStock = product.stock;

    switch (type) {
      case 'IN':
      case 'RETURN':
        stockChange = Math.abs(quantity);
        newStock = product.stock + stockChange;
        break;
      case 'OUT':
      case 'WRITE_OFF':
        stockChange = -Math.abs(quantity);
        newStock = product.stock + stockChange;
        if (newStock < 0) {
          return NextResponse.json({
            error: `Omborda yetarli tovar yo'q. Mavjud: ${product.stock}, So'ralgan: ${Math.abs(quantity)}`,
          }, { status: 400 });
        }
        break;
      case 'ADJUSTMENT':
        // quantity = new absolute stock value
        stockChange = quantity - product.stock;
        newStock = quantity;
        break;
    }

    // Execute in transaction
    const [movement] = await prisma.$transaction([
      prisma.stockMovement.create({
        data: {
          productId,
          type: type as 'IN' | 'OUT' | 'ADJUSTMENT' | 'RETURN' | 'WRITE_OFF',
          quantity: stockChange,
          reason: reason || null,
          note: note || null,
          supplierId: supplierId || null,
          costPrice: costPrice || null,
          orderId: orderId || null,
          performedBy: performedBy || null,
        },
        include: {
          product: { select: { nameUz: true, stock: true } },
        },
      }),
      prisma.product.update({
        where: { id: productId },
        data: { stock: newStock },
      }),
    ]);

    // Check if low stock alert needed
    let alert = null;
    if (newStock <= 5 && (type === 'OUT' || type === 'WRITE_OFF')) {
      alert = {
        level: newStock <= 2 ? 'CRITICAL' : 'WARNING',
        message: `${product.nameUz} — faqat ${newStock} dona qoldi!`,
      };

      // Send Telegram alert (fire-and-forget)
      const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
      const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
      if (BOT_TOKEN && ADMIN_CHAT_ID) {
        const icon = newStock <= 2 ? '🔴' : '🟡';
        const msg = `${icon} *KAM QOLDI*\n\n${product.nameUz}\nOmborda: *${newStock} dona*\n\nSabab: ${reason || type}\n${performedBy ? `Kim: ${performedBy}` : ''}`;
        fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text: msg, parse_mode: 'Markdown' }),
        }).catch(() => {});
      }
    }

    return NextResponse.json({
      success: true,
      movement,
      newStock,
      alert,
    });
  } catch (error) {
    console.error('Stock movement error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

// DELETE — Remove movement(s)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const clearAll = searchParams.get('clear');

    if (clearAll === 'all') {
      // Clear all movements (history only — stock unchanged)
      const result = await prisma.stockMovement.deleteMany({});
      return NextResponse.json({ success: true, deleted: result.count });
    }

    if (!id) {
      return NextResponse.json({ error: 'ID kerak' }, { status: 400 });
    }

    // Delete single movement (history only — stock unchanged)
    await prisma.stockMovement.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete movement error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

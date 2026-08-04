import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@repo/database';

// Возврат товара. Вынесено из api/inventory/pos/route.ts.

/** Возвращает готовый ответ: коды статусов у отказов различаются по причине. */
export async function processRefund(request: NextRequest): Promise<NextResponse> {
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
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  const returnNumber = `R-${dateStr}-${rand}`;

  await prisma.$transaction(async (tx) => {
    for (const item of items as { productId: string; quantity: number; price: number }[]) {
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          type: 'IN',
          quantity: Math.abs(item.quantity),
          reason: `Qaytarish (${returnNumber}): ${reason || "Sabab ko'rsatilmagan"}`,
          performedBy: performedBy || 'Egasi',
          // costPrice не ставим намеренно: возврат не должен попадать в
          // расчёт себестоимости закупок как «приход по цене».
          costPrice: null,
          // А вот salePrice ставим — по нему считается сумма возврата.
          // Без него отчёты пересчитывали возврат по СЕГОДНЯШНЕМУ прайсу,
          // и после смены цены сумма возврата менялась задним числом.
          salePrice: item.price,
        },
      });

      // Прибавляем, а не пишем абсолютное значение, посчитанное до начала
      // транзакции: два одновременных возврата иначе затирали друг друга.
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: Math.abs(item.quantity) } },
      });
    }
  });

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
}

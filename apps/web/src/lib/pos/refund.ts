import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@repo/database';

// Возврат товара. Вынесено из api/inventory/pos/route.ts.

/**
 * Сколько чего продано в этом чеке.
 *
 * Номер продажи живёт внутри строки `reason` («Do'kon sotish (S-…)» или
 * «Qarzga sotish — Имя (S-…)»), отдельной колонки под него нет. Ищем
 * вхождением — так же, как это делает отчёт по продажам в pos/route.ts.
 */
async function soldQuantities(saleNumber: string): Promise<Map<string, number>> {
  const movements = await prisma.stockMovement.findMany({
    where: { type: 'OUT', reason: { contains: saleNumber } },
    select: { productId: true, quantity: true },
  });
  const map = new Map<string, number>();
  for (const m of movements) {
    map.set(m.productId, (map.get(m.productId) ?? 0) + Math.abs(m.quantity));
  }
  return map;
}

/** Сколько по этому чеку уже вернули — чтобы второй возврат не прошёл дважды. */
async function refundedQuantities(saleNumber: string): Promise<Map<string, number>> {
  const movements = await prisma.stockMovement.findMany({
    where: { type: 'IN', reason: { contains: saleNumber } },
    select: { productId: true, quantity: true },
  });
  const map = new Map<string, number>();
  for (const m of movements) {
    map.set(m.productId, (map.get(m.productId) ?? 0) + Math.abs(m.quantity));
  }
  return map;
}

/** Возвращает готовый ответ: коды статусов у отказов различаются по причине. */
export async function processRefund(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();
  const { items, reason, performedBy, saleNumber } = body;
  // items: [{ productId, quantity, price }]
  // saleNumber: номер исходной продажи (S-…)
  // reason: string (return reason)
  // performedBy: employee name

  if (!items || items.length === 0) {
    return NextResponse.json({ error: "Qaytarish ro'yxati bo'sh" }, { status: 400 });
  }

  // ── Возврат привязан к продаже, и вернуть больше проданного нельзя ──
  //
  // Раньше не было ни того, ни другого: товары, количества и цены брались
  // прямо из запроса, связи с исходной продажей не существовало, и повторный
  // возврат ничем не отличался от первого. Один и тот же запрос, отправленный
  // дважды, дважды прибавлял товар на склад и дважды уменьшал выручку.
  // Доступ к этой ручке — уровень STAFF, то есть любой продавец.
  if (!saleNumber || typeof saleNumber !== 'string') {
    return NextResponse.json(
      { error: "Sotish raqami majburiy (S-…). Qaysi sotishdan qaytarilyapti?" },
      { status: 400 },
    );
  }

  const sold = await soldQuantities(saleNumber);
  if (sold.size === 0) {
    return NextResponse.json(
      { error: `Sotish topilmadi: ${saleNumber}` },
      { status: 404 },
    );
  }
  const alreadyReturned = await refundedQuantities(saleNumber);

  // Validate products exist
  const productIds = items.map((i: { productId: string }) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, nameUz: true, stock: true, price: true },
  });
  const productMap = new Map(products.map(p => [p.id, p]));

  for (const item of items as { productId: string; quantity: number }[]) {
    const product = productMap.get(item.productId);
    if (!product) {
      return NextResponse.json({ error: `Tovar topilmadi: ${item.productId}` }, { status: 404 });
    }
    const available =
      (sold.get(item.productId) ?? 0) - (alreadyReturned.get(item.productId) ?? 0);
    if (Math.abs(item.quantity) > available) {
      return NextResponse.json({
        error:
          `${product.nameUz}: bu sotishda ${sold.get(item.productId) ?? 0} dona sotilgan, ` +
          `${alreadyReturned.get(item.productId) ?? 0} dona qaytarilgan. ` +
          `Ko'pi bilan ${Math.max(0, available)} dona qaytarish mumkin.`,
      }, { status: 400 });
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
          // Номер исходной продажи входит в причину: по нему считается,
          // сколько уже вернули, и второй возврат сверх проданного не пройдёт.
          reason: `Qaytarish (${returnNumber}) ← ${saleNumber}: ${reason || "Sabab ko'rsatilmagan"}`,
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

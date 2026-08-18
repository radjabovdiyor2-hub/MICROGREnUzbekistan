import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@repo/database';
import { cartTotal, formatQty, formatQtyWithUnit, isValidQty, lineTotal, normalizeQty } from '@/lib/qty';
import { formatLocalDate } from '@/lib/revenue/salesLedger';

/**
 * Допуск при сверке количеств.
 *
 * Количества дробные, и `Decimal` переводится в число: 1.3 в double чуть-чуть
 * не 1.3. Строгое `>` отбило бы возврат РОВНО проданного количества — товар
 * принесли обратно целиком, а касса отвечает «столько не продавали».
 * Допуск меньше половины последнего хранимого знака (0.01), поэтому лишнюю
 * копейку он не пропускает.
 */
const QTY_EPSILON = 1e-9;

// Возврат товара. Вынесено из api/inventory/pos/route.ts.

/**
 * Сколько чего продано в этом чеке.
 *
 * Номер чека теперь лежит в колонке `saleNumber`. Поиск вхождением в
 * `reason` оставлен вторым условием: у строк, записанных до появления
 * колонки, она пустая, и без этого возврат по старому чеку перестал бы
 * находиться — «Sotish topilmadi» на чек, который заведомо был.
 */
async function soldQuantities(saleNumber: string): Promise<Map<string, number>> {
  const movements = await prisma.stockMovement.findMany({
    where: {
      type: 'OUT',
      OR: [
        { sale: { number: saleNumber } },
        // Запасной путь для чеков, записанных до появления шапки: у них
        // ссылки нет, а номер лежит внутри текста причины.
        { reason: { contains: saleNumber } },
      ],
    },
    select: { productId: true, quantity: true },
  });
  const map = new Map<string, number>();
  for (const m of movements) {
    map.set(m.productId, normalizeQty((map.get(m.productId) ?? 0) + Math.abs(m.quantity)));
  }
  return map;
}

/** Сколько по этому чеку уже вернули — чтобы второй возврат не прошёл дважды. */
async function refundedQuantities(saleNumber: string): Promise<Map<string, number>> {
  const movements = await prisma.stockMovement.findMany({
    where: { type: 'IN', reason: { contains: saleNumber } },
    select: { productId: true, quantity: true },
  });
  // Возврат ссылается на исходный чек в `reason` («Qaytarish (R-…) ← S-…»),
  // а в колонке `saleNumber` у него собственный номер возврата — поэтому
  // здесь поиск только по тексту.
  const map = new Map<string, number>();
  for (const m of movements) {
    map.set(m.productId, normalizeQty((map.get(m.productId) ?? 0) + Math.abs(m.quantity)));
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
    select: { id: true, nameUz: true, unit: true, stock: true, price: true },
  });
  const productMap = new Map(products.map(p => [p.id, p]));

  for (const item of items as { productId: string; quantity: number }[]) {
    const product = productMap.get(item.productId);
    if (!product) {
      return NextResponse.json({ error: `Tovar topilmadi: ${item.productId}` }, { status: 404 });
    }
    if (!isValidQty(Math.abs(item.quantity))) {
      return NextResponse.json(
        { error: `${product.nameUz}: miqdor noto'g'ri (${item.quantity})` },
        { status: 400 },
      );
    }
    const available = normalizeQty(
      (sold.get(item.productId) ?? 0) - (alreadyReturned.get(item.productId) ?? 0),
    );
    if (Math.abs(item.quantity) - available > QTY_EPSILON) {
      return NextResponse.json({
        error:
          `${product.nameUz}: bu sotishda ${formatQtyWithUnit(sold.get(item.productId) ?? 0, product.unit)} sotilgan, ` +
          `${formatQty(alreadyReturned.get(item.productId) ?? 0)} qaytarilgan. ` +
          `Ko'pi bilan ${formatQtyWithUnit(Math.max(0, available), product.unit)} qaytarish mumkin.`,
      }, { status: 400 });
    }
  }

  // Calculate total refund
  const totalRefund = cartTotal(items as { price: number; quantity: number }[]);

  // Номер возврата — по МЕСТНОЙ дате. Раньше он брался из `toISOString()`,
  // то есть по UTC: возврат в 02:00 по Ташкенту получал в номере вчерашнее
  // число, и персонал не находил его по дате (тот же дефект был у продажи).
  const now = new Date();
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  const returnNumber = `R-${formatLocalDate(now).replace(/-/g, '')}-${rand}`;

  await prisma.$transaction(async (tx) => {
    // Шапка возврата. Ссылка на исходную продажу — внешним ключом, а не
    // вхождением номера в текст: сверка «вернули не больше проданного»
    // держалась на подстроке.
    const original = await tx.posSale.findUnique({
      where: { number: saleNumber },
      select: { id: true },
    });
    const refundSale = await tx.posSale.create({
      data: {
        number: returnNumber,
        kind: 'refund',
        soldAt: now,
        performedBy: performedBy || 'Egasi',
        paymentMethod: 'cash',
        gross: totalRefund,
        total: totalRefund,
        reason: reason || null,
        refundOfId: original?.id ?? null,
      },
    });

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
          saleId: refundSale.id,
          // Деловая дата возврата — время возврата, а не исходной продажи.
          soldAt: now,
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
      msg += `• ${p.nameUz} × ${formatQtyWithUnit(item.quantity, p.unit)} = ${fmt(lineTotal(item.price, item.quantity))}\n`;
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

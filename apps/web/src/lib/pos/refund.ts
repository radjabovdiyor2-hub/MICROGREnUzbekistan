import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@repo/database';
import { audit } from '@/lib/audit';
import { detach } from '@/lib/background';
import { notifyAdminRaw } from '@/lib/notify';
import { drainOffice, enqueueOffice } from '@/lib/office/outbox';
import { posRefundIngestBody } from '@/lib/orders/notify';
import { cartTotal, formatQty, formatQtyWithUnit, isValidQty, lineTotal, normalizeQty } from '@/lib/qty';
import { formatLocalDate } from '@/lib/revenue/salesLedger';
import { openKeyboard } from '@/lib/telegram/adminLinks';

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
    // Товар удалён из каталога окончательно — возвращать остаток некуда,
    // и в расчёт возврата такая позиция не входит. Движение при этом
    // остаётся в истории: выручку по нему уже посчитали.
    if (!m.productId) continue;
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
    // Товар удалён из каталога окончательно — возвращать остаток некуда,
    // и в расчёт возврата такая позиция не входит. Движение при этом
    // остаётся в истории: выручку по нему уже посчитали.
    if (!m.productId) continue;
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

  // ── Чей это был чек ────────────────────────────────────────────────
  //
  // Возврат не знал покупателя вовсе: шапка писалась без `customer_id`, а в
  // CRM не уходила ни строкой. Деньги возвращали, но в «Потрачено» клиента
  // они оставались навсегда — карточка показывала покупки, которых нет.
  const original = await prisma.posSale.findUnique({
    where: { number: saleNumber },
    select: {
      id: true,
      customerId: true,
      customer: {
        select: { id: true, name: true, companyName: true, phone: true, address: true },
      },
    },
  });

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
        // Покупатель переносится из исходного чека: возврат касается того же
        // клиента, и спрашивать его заново незачем.
        customerId: original?.customerId ?? null,
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

    // Зеркало возврата — в той же транзакции, что и сам возврат. Уходит
    // ОТРИЦАТЕЛЬНОЙ суммой, а не отменой исходного чека: возврат бывает
    // частичным, и отмена вычла бы у клиента всю покупку целиком.
    await enqueueOffice(tx, {
      topic: 'order',
      refKey: returnNumber,
      payload: posRefundIngestBody({
        returnNumber,
        saleNumber,
        totalRefund,
        refundedAt: now.toISOString(),
        reason: reason || null,
        customer: {
          id: original?.customer?.id ?? null,
          name: original?.customer
            ? original.customer.companyName || original.customer.name
            : null,
          phone: original?.customer?.phone ?? null,
          address: original?.customer?.address ?? null,
        },
        items: (items as { productId: string; quantity: number; price: number }[]).map((i) => ({
          productId: i.productId,
          name: productMap.get(i.productId)?.nameUz ?? 'Tovar',
          quantity: Math.abs(i.quantity),
          price: i.price,
        })),
      }),
    });
  });

  // Возврат двигает и склад, и деньги — след в журнале действий обязателен.
  // Его не было вовсе: у продажи аудит есть, у возврата не было.
  audit({
    action: 'pos.refund',
    actor: performedBy || 'Egasi',
    target: returnNumber,
    meta: { saleNumber, totalRefund, itemCount: items.length, customerId: original?.customerId ?? null },
  });

  // Отправка зеркала — в фоне: кассу у прилавка держать нельзя.
  detach('зеркало возврата в офис', drainOffice());

  // Уведомление владельцу — не задерживая кассу. Наличие токена проверяет
  // сам отправитель; здесь нужен только чат для кнопки на экран.
  const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
  if (ADMIN_CHAT_ID) {
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

    // Через общий отправитель: свой `fetch(...).catch(() => {})` не
    // срабатывал на отказе Telegram — `fetch` не отклоняется на
    // HTTP-ответе, и 401 выглядел как доставленное сообщение.
    //
    // Возврат разбирают в журнале движений: там видно, что вернулось
    // на склад и по какому чеку.
    void notifyAdminRaw(
      msg,
      openKeyboard(ADMIN_CHAT_ID, 'movements', returnNumber, '📋 Движения'),
    );
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

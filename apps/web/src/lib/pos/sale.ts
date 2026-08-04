import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@repo/database';
import { notifyOfficePosSale } from '@/lib/orders/notify';

// ══════════════════════════════════════════════════════════════════════
// Продажа в магазине. Вынесено из api/inventory/pos/route.ts: файл
// перерос 200 строк, а в route.ts Next.js разрешает экспортировать
// только HTTP-обработчики. Здесь списание остатков и запись долга.
// ══════════════════════════════════════════════════════════════════════

/** Остатка не хватило — откатывает транзакцию и превращается в 400. */
class PosStockError extends Error {}

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

  // Один товар мог попасть в чек дважды («ещё пачку того же»). Складываем
  // количества до записи: иначе два UPDATE по одной строке затирали друг
  // друга, и со склада уходила только последняя порция.
  const quantityByProduct = new Map<string, number>();
  for (const item of items as { productId: string; quantity: number }[]) {
    quantityByProduct.set(
      item.productId,
      (quantityByProduct.get(item.productId) ?? 0) + Math.abs(item.quantity),
    );
  }

  // ── Списание остатка и журнал — одной транзакцией с проверкой внутри ──
  //
  // Раньше остаток писался абсолютным значением, посчитанным в JS ДО начала
  // транзакции: `stock: product.stock - item.quantity`. Две одновременные
  // продажи одного товара читали 100, обе писали 95 — со склада уходило пять
  // штук вместо десяти. Проверка «хватает ли остатка» тоже шла до транзакции
  // и потому не мешала уйти в минус.
  //
  // Теперь остаток уменьшается условным UPDATE внутри транзакции: не хватило —
  // ничего не записалось, продажа отклонена целиком.
  let stockAfter: Map<string, number>;
  try {
    stockAfter = await prisma.$transaction(async (tx) => {
      const after = new Map<string, number>();

      for (const [productId, quantity] of quantityByProduct) {
        const decremented = await tx.product.updateMany({
          where: { id: productId, stock: { gte: quantity } },
          data: { stock: { decrement: quantity } },
        });
        if (decremented.count === 0) {
          const name = productMap.get(productId)?.nameUz ?? productId;
          throw new PosStockError(`${name}: omborda yetarli emas`);
        }
        const fresh = await tx.product.findUnique({
          where: { id: productId },
          select: { stock: true },
        });
        after.set(productId, fresh?.stock ?? 0);
      }

      for (const item of items as { productId: string; quantity: number; price: number }[]) {
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            type: 'OUT',
            quantity: -Math.abs(item.quantity),
            reason: paymentMethod === 'debt'
              ? `Qarzga sotish — ${debtInfo?.personName || 'Nomalum'} (${saleNumber})`
              : `Do'kon sotish (${saleNumber})`,
            performedBy: performedBy || 'Egasi',
            costPrice: productMap.get(item.productId)?.costPrice || null,
            // salePrice отличает продажу от ручного списания — по нему
            // lib/revenue считает выручку кассы. Без него продажа исчезла бы
            // из отчётов, а списание, наоборот, попало бы в выручку.
            salePrice: item.price,
          },
        });
      }

      if (paymentMethod === 'debt' && debtInfo) {
        await tx.debt.create({
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
        });
      }

      return after;
    });
  } catch (err) {
    if (err instanceof PosStockError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  // Предупреждения считаем по РЕАЛЬНОМУ остатку после транзакции, а не по
  // значению, прочитанному до неё.
  const alerts: { productName: string; stock: number; level: string }[] = [];
  for (const [productId, newStock] of stockAfter) {
    if (newStock <= 5) {
      alerts.push({
        productName: productMap.get(productId)?.nameUz ?? productId,
        stock: newStock,
        level: newStock <= 2 ? 'CRITICAL' : 'WARNING',
      });
    }
  }

  // Зеркало в CRM офиса. Без него продажа за прилавком оставалась невидимой:
  // ни Стёпан, ни финансы, ни аналитика отделов её не видели, и в P&L выручка
  // магазина не попадала. Не ждём ответа — недоступный офис не должен
  // задерживать покупателя у кассы.
  notifyOfficePosSale({
    saleNumber,
    total,
    paymentMethod: paymentMethod === 'debt' ? 'debt' : paymentMethod || 'cash',
    customerName: paymentMethod === 'debt' ? debtInfo?.personName : null,
    customerPhone: paymentMethod === 'debt' ? debtInfo?.phone : null,
    items: (items as { productId: string; quantity: number; price: number }[]).map((i) => ({
      productId: i.productId,
      name: productMap.get(i.productId)?.nameUz ?? 'Tovar',
      quantity: i.quantity,
      price: i.price,
    })),
  }).catch(() => {});

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

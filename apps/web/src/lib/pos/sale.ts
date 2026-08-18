import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@repo/database';
import { notifyOfficePosSale } from '@/lib/orders/notify';
import { formatQty, formatQtyWithUnit, normalizeQty } from '@/lib/qty';
import { formatLocalDate } from '@/lib/revenue/salesLedger';
import { allocateDiscount } from './discount';
import { parseSale } from './saleInput';
import { recordAudit } from './saleAudit';
import { buildSaleMessage, notifyOwner, type NotifyAlert } from './saleNotify';

/** Уровень тревоги по остатку. `null` — тревожиться не о чем. */
const stockLevel = (stock: number): 'CRITICAL' | 'WARNING' | null =>
  stock <= 2 ? 'CRITICAL' : stock <= 5 ? 'WARNING' : null;

// ══════════════════════════════════════════════════════════════════════
// Продажа в магазине. Вынесено из api/inventory/pos/route.ts: файл
// перерос 200 строк, а в route.ts Next.js разрешает экспортировать
// только HTTP-обработчики. Здесь списание остатков и запись долга.
//
// Разбор и проверка тела — в saleInput.ts, разнесение скидки на чек —
// в discount.ts, сборка уведомления владельцу — в saleNotify.ts.
// ══════════════════════════════════════════════════════════════════════

/** Возвращает готовый ответ: коды статусов у отказов различаются по причине. */
export async function processSale(request: NextRequest): Promise<NextResponse> {
  const parsed = parseSale(request, await request.json());
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const {
    items, paymentMethod, performedBy, role, customerId,
    soldAt, backdated, backdateReason, discount, debtInfo,
  } = parsed.sale;

  const products = await prisma.product.findMany({
    where: { id: { in: items.map((i) => i.productId) } },
    select: { id: true, nameUz: true, unit: true, stock: true, price: true, costPrice: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  // Остаток продажу НЕ запрещает — проверяем только существование товара.
  //
  // Отказ по остатку здесь означал: продавец держит товар в руках, покупатель
  // стоит у кассы, а чек не проходит из-за отставшего числа в базе. Сайт в
  // такой же ситуации заказ принимает (микрозелень растят под заказ), и после
  // перехода каталога на прайс с нулевыми остатками касса встала совсем.
  //
  // Нехватка не теряется: она уходит в примечание движения и видна в журнале
  // склада — то есть остаток чинится инвентаризацией, а не срывом продажи.
  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product) {
      return NextResponse.json({ error: `Tovar topilmadi: ${item.productId}` }, { status: 404 });
    }
    // Уступка без причины через месяц необъяснима: владелец видит, что товар
    // за 15 000 ушёл по 13 000, и спросить не у кого. Проверка здесь, а не в
    // saleInput: пока не прочитан прайс, сравнивать не с чем.
    if (item.price !== product.price && !item.priceReason) {
      return NextResponse.json(
        { error: `${product.nameUz}: narx o'zgartirilgan, sabab majburiy` },
        { status: 400 },
      );
    }
  }

  // Скидка на чек разносится по позициям: у чека нет строки-шапки в базе, а
  // выручка кассы считается как `quantity × salePrice`. Не разнести — значит
  // показать в отчётах сумму до скидки, то есть деньги, которых не было.
  const allocation = allocateDiscount(items, discount);
  const effectivePrice = new Map<string, number>();
  items.forEach((item, i) => effectivePrice.set(item.productId, allocation.lines[i].price));
  const total = allocation.net;

  // Номер чека — от ДЕЛОВОЙ даты и по местному времени. Раньше он строился
  // из `toISOString()`, то есть по UTC: продажа в 02:00 по Ташкенту получала
  // в номере вчерашнее число, и персонал не находил её по дате.
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  const saleNumber = `S-${formatLocalDate(soldAt).replace(/-/g, '')}-${rand}`;

  // Один товар мог попасть в чек дважды («ещё пачку того же»). Складываем
  // количества до записи: иначе два UPDATE по одной строке затирали друг
  // друга, и со склада уходила только последняя порция.
  const quantityByProduct = new Map<string, number>();
  for (const item of items) {
    quantityByProduct.set(
      item.productId,
      // Нормализация обязательна: 0.1 + 0.2 в double даёт 0.30000000000000004,
      // и такой хвост ушёл бы в условие `stock >= quantity`.
      normalizeQty((quantityByProduct.get(item.productId) ?? 0) + item.quantity),
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
  // Теперь остаток уменьшается условным UPDATE внутри транзакции. Не хватило —
  // списываем что было и зажимаем нулём: продажа состоялась физически, и
  // отменять её из-за отставшего числа нельзя. В минус тоже не уходим —
  // отрицательный остаток сделал бы бессмысленным расчёт закупки.
  //
  // Остаток списывается ТЕКУЩИЙ, даже у продажи задним числом: товар ушёл
  // вчера, но со склада его тогда не сняли. Деловая дата двигает отчёты, а
  // не сегодняшнюю полку.
  const shortfall = new Map<string, number>();
  const stockAfter = await prisma.$transaction(async (tx) => {
    const after = new Map<string, number>();

    // Шапка чека создаётся ПЕРВОЙ: позиции ссылаются на неё, и всё, что
    // относится к продаже целиком — покупатель, скидка, деловая дата и её
    // причина, — живёт здесь, а не размазано по примечаниям позиций.
    const sale = await tx.posSale.create({
      data: {
        number: saleNumber,
        kind: 'sale',
        soldAt,
        performedBy,
        role,
        paymentMethod,
        customerId,
        gross: allocation.gross,
        discount: allocation.applied,
        discountType: discount?.type ?? null,
        discountReason: discount?.reason ?? null,
        total,
        backdated,
        backdateReason,
      },
    });

    for (const [productId, quantity] of quantityByProduct) {
      const decremented = await tx.product.updateMany({
        where: { id: productId, stock: { gte: quantity } },
        data: { stock: { decrement: quantity } },
      });
      if (decremented.count === 0) {
        // Забираем остаток до нуля одним условным UPDATE — при гонке
        // выиграет только один вызов, второй увидит уже ноль.
        const before = await tx.product.findUnique({
          where: { id: productId },
          select: { stock: true },
        });
        const had = before?.stock ?? 0;
        if (had > 0) {
          await tx.product.updateMany({
            where: { id: productId, stock: { gt: 0 } },
            data: { stock: 0 },
          });
        }
        shortfall.set(productId, normalizeQty(quantity - had));
      }
      const fresh = await tx.product.findUnique({
        where: { id: productId },
        select: { stock: true },
      });
      after.set(productId, fresh?.stock ?? 0);
    }

    for (const item of items) {
      const product = productMap.get(item.productId)!;

      // В примечании осталась ТОЛЬКО нехватка остатка. Причина уступки
      // переехала в свою колонку, а скидка на чек и деловая дата — в шапку:
      // раньше все четыре склеивались в одну строку и читались глазами.
      const missing = shortfall.get(item.productId);

      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          type: 'OUT',
          quantity: -item.quantity,
          reason: paymentMethod === 'debt'
            ? `Qarzga sotish — ${debtInfo?.personName || 'Nomalum'} (${saleNumber})`
            : `Do'kon sotish (${saleNumber})`,
          note: missing
            ? `Продано сверх остатка на ${formatQty(missing)} — требуется инвентаризация`
            : null,
          performedBy,
          costPrice: product.costPrice || null,
          // salePrice отличает продажу от ручного списания — по нему
          // lib/revenue считает выручку кассы. Без него продажа исчезла бы
          // из отчётов, а списание, наоборот, попало бы в выручку.
          salePrice: effectivePrice.get(item.productId) ?? item.price,
          // Прайс на момент продажи: без него уступку не с чем сравнить,
          // а сегодняшний прайс к тому времени уже поменяется.
          listPrice: product.price,
          priceReason: item.priceReason ?? null,
          saleId: sale.id,
          soldAt,
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
          description: `Do'kon sotish ${saleNumber}: ${items.map((i) => {
            const p = productMap.get(i.productId);
            return `${p?.nameUz} × ${formatQtyWithUnit(i.quantity, p?.unit)}`;
          }).join(', ')}`,
          dueDate: debtInfo.dueDate ? new Date(debtInfo.dueDate) : null,
          isPaid: false,
          // Долг возник в день продажи, а не в день, когда о нём вспомнили.
          createdAt: soldAt,
        },
      });
    }

    return after;
  });

  // Предупреждения считаем по РЕАЛЬНОМУ остатку после транзакции, а не по
  // значению, прочитанному до неё. И только если стало ХУЖЕ: товар, который
  // и так лежал на нуле, — не новость, а при нулевом каталоге такая строка
  // висела бы в каждом чеке по каждой позиции.
  const alerts: NotifyAlert[] = [];
  for (const [productId, newStock] of stockAfter) {
    const level = stockLevel(newStock);
    if (!level) continue;
    if (level === stockLevel(productMap.get(productId)?.stock ?? 0)) continue;
    alerts.push({
      productName: productMap.get(productId)?.nameUz ?? productId,
      stock: newStock,
      unit: productMap.get(productId)?.unit ?? null,
      level,
    });
  }

  recordAudit({
    request, saleNumber, performedBy, role, total,
    backdated, soldAt, backdateReason,
    priceOverrides: items
      .filter((i) => i.price !== productMap.get(i.productId)?.price)
      .map((i) => ({
        productId: i.productId,
        listPrice: productMap.get(i.productId)?.price ?? null,
        salePrice: effectivePrice.get(i.productId) ?? i.price,
        reason: i.priceReason ?? null,
      })),
    discount: discount ? { ...discount, applied: allocation.applied } : null,
  });

  // Зеркало в CRM офиса. Без него продажа за прилавком оставалась невидимой:
  // ни Стёпан, ни финансы, ни аналитика отделов её не видели, и в P&L выручка
  // магазина не попадала. Не ждём ответа — недоступный офис не должен
  // задерживать покупателя у кассы.
  notifyOfficePosSale({
    saleNumber,
    total,
    soldAt: soldAt.toISOString(),
    paymentMethod,
    customerName: paymentMethod === 'debt' ? debtInfo?.personName ?? null : null,
    customerPhone: paymentMethod === 'debt' ? debtInfo?.phone ?? null : null,
    items: items.map((i) => ({
      productId: i.productId,
      name: productMap.get(i.productId)?.nameUz ?? 'Tovar',
      quantity: i.quantity,
      price: effectivePrice.get(i.productId) ?? i.price,
    })),
  }).catch(() => {});

  notifyOwner(buildSaleMessage({
    saleNumber, total, discountApplied: allocation.applied, paymentMethod,
    performedBy, soldAt, backdated, backdateReason,
    lines: items.map((i) => ({
      name: productMap.get(i.productId)?.nameUz ?? 'Tovar',
      unit: productMap.get(i.productId)?.unit ?? null,
      quantity: i.quantity,
      price: effectivePrice.get(i.productId) ?? i.price,
    })),
    alerts,
  }));

  return NextResponse.json({
    success: true,
    saleNumber,
    total,
    gross: allocation.gross,
    // Фактическая скидка, а не запрошенная: цена за единицу целая, и долю
    // скидки не всегда удаётся выразить точно (см. discount.ts).
    discount: allocation.applied,
    itemCount: items.length,
    paymentMethod,
    performedBy,
    backdated,
    alerts,
    soldAt: soldAt.toISOString(),
    createdAt: new Date().toISOString(),
  });
}

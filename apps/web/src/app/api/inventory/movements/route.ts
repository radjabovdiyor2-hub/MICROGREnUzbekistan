import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { isValidQty, normalizeQty } from '@/lib/qty';
import { publish } from '@/lib/realtime/bus';
import { openKeyboard } from '@/lib/telegram/adminLinks';

// ==========================================
// Stock Movements API — Inventory Operations
//
// Журнал движений — источник правды для остатка и для выручки кассы
// (lib/revenue считает по нему продажи в точке). Поэтому запись сюда идёт
// только вместе с изменением остатка, в одной транзакции, и только
// относительными операциями.
// ==========================================

/** Остатка не хватило — откатывает транзакцию и превращается в 400. */
class NotEnoughStockError extends Error {}

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

    // Количество дробное, но не любое: колонка хранит два знака, и третий
    // Postgres округлил бы молча — журнал склада разошёлся бы с остатком.
    if (!isValidQty(Math.abs(Number(quantity)))) {
      return NextResponse.json({ error: `Miqdor noto'g'ri: ${String(quantity)}` }, { status: 400 });
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

    // ── Остаток меняем ВНУТРИ транзакции, относительной операцией ──
    //
    // Раньше новое значение считалось в JS из чтения, сделанного до
    // транзакции, и записывалось абсолютом. Два одновременных прихода читали
    // один остаток и оба писали одно и то же — половина товара пропадала.
    // Проверка «не уйти в минус» по той же причине не срабатывала при гонке.
    //
    // ADJUSTMENT — исключение: это инвентаризация, её смысл именно в том,
    // чтобы поставить остаток равным пересчитанному вручную.
    let movement;
    let newStock: number;
    try {
      const result = await prisma.$transaction(async (tx) => {
        let delta = 0;
        let after: number;

        if (type === 'ADJUSTMENT') {
          // `Math.floor` стоял, пока остаток был целым: выставить по итогам
          // пересчёта 8.7 кг было нельзя — округлялось до 8, и почти
          // килограмм списывался инвентаризацией в никуда.
          const target = Math.max(0, normalizeQty(Number(quantity)));
          const current = await tx.product.findUnique({
            where: { id: productId },
            select: { stock: true },
          });
          delta = target - (current?.stock ?? 0);
          await tx.product.update({ where: { id: productId }, data: { stock: target } });
          after = target;
        } else if (type === 'IN' || type === 'RETURN') {
          delta = Math.abs(quantity);
          const updated = await tx.product.update({
            where: { id: productId },
            data: { stock: { increment: delta } },
            select: { stock: true },
          });
          after = updated.stock;
        } else {
          delta = -Math.abs(quantity);
          const decremented = await tx.product.updateMany({
            where: { id: productId, stock: { gte: Math.abs(quantity) } },
            data: { stock: { decrement: Math.abs(quantity) } },
          });
          if (decremented.count === 0) throw new NotEnoughStockError();
          const fresh = await tx.product.findUnique({
            where: { id: productId },
            select: { stock: true },
          });
          after = fresh?.stock ?? 0;
        }

        const created = await tx.stockMovement.create({
          data: {
            productId,
            type: type as 'IN' | 'OUT' | 'ADJUSTMENT' | 'RETURN' | 'WRITE_OFF',
            quantity: delta,
            reason: reason || null,
            note: note || null,
            supplierId: supplierId || null,
            costPrice: costPrice || null,
            orderId: orderId || null,
            performedBy: performedBy || null,
            // Деловая дата задаётся явно: дефолта у колонки нет (см. схему).
            soldAt: new Date(),
          },
          include: { product: { select: { nameUz: true, stock: true } } },
        });

        return { created, after };
      });
      movement = result.created;
      newStock = result.after;
    } catch (err) {
      if (err instanceof NotEnoughStockError) {
        return NextResponse.json({
          error: `Omborda yetarli tovar yo'q. Mavjud: ${product.stock}, So'ralgan: ${Math.abs(quantity)}`,
        }, { status: 400 });
      }
      throw err;
    }

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
          body: JSON.stringify({
            chat_id: ADMIN_CHAT_ID,
            text: msg,
            parse_mode: 'Markdown',
            reply_markup: openKeyboard(ADMIN_CHAT_ID, 'inventory', null, '📦 Склад'),
            disable_web_page_preview: true,
          }),
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

// DELETE — исправление ошибочного движения ОБРАТНОЙ проводкой.
//
// ⚠️ Удаления больше нет, и это осознанно.
//
// Раньше здесь было два удаления, оба разрушительные:
//   • `?clear=all` стирал ВЕСЬ журнал движений одним запросом, не трогая
//     остатки. Вся выручка кассы считается из этого журнала — после такого
//     вызова она обнулялась задним числом за всю историю. Доступ: уровень
//     STAFF, то есть любой продавец.
//   • удаление одиночного движения оставляло остаток изменённым, и склад
//     переставал сходиться с журналом навсегда.
//
// Правильное исправление ошибки — не стереть запись, а провести обратную:
// журнал остаётся полным, остаток возвращается к верному значению.
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (searchParams.get('clear') === 'all') {
      return NextResponse.json({
        error:
          'Массовое удаление журнала отключено: из него считается выручка. ' +
          'Ошибочное движение исправляется обратной проводкой.',
      }, { status: 400 });
    }

    if (!id) {
      return NextResponse.json({ error: 'ID kerak' }, { status: 400 });
    }

    const original = await prisma.stockMovement.findUnique({ where: { id } });
    if (!original) {
      return NextResponse.json({ error: 'Harakat topilmadi' }, { status: 404 });
    }
    // Сторно двигает остаток на карточке товара. Товар удалён из каталога
    // окончательно — двигать нечего, и молча создать одну лишь запись в
    // журнале было бы хуже отказа: остатки и история разошлись бы.
    // В локальную константу: внутри колбэка транзакции TypeScript сужение
    // по свойству не сохраняет, а класть сюда `!` значило бы вернуть ровно
    // ту уверенность, из-за которой каскад и стирал историю.
    const productId = original.productId;
    if (!productId) {
      return NextResponse.json(
        { error: "Tovar katalogdan butunlay o'chirilgan — harakatni storno qilib bo'lmaydi" },
        { status: 409 },
      );
    }

    const reversal = await prisma.$transaction(async (tx) => {
      // quantity хранится со знаком: приход положительный, расход
      // отрицательный. Обратная проводка — тот же модуль с обратным знаком.
      await tx.product.update({
        where: { id: productId },
        data: { stock: { increment: -original.quantity } },
      });
      return tx.stockMovement.create({
        data: {
          productId,
          productName: original.productName,
          type: original.quantity > 0 ? 'OUT' : 'IN',
          quantity: -original.quantity,
          reason: `Сторно движения ${original.id}`,
          note: original.reason,
          performedBy: 'System',
          soldAt: new Date(),
        },
      });
    });

    publish('inventory', 'products');
    return NextResponse.json({ success: true, reversal });
  } catch (error) {
    console.error('Reverse movement error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

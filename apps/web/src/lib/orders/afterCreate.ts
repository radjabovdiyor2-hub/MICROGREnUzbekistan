import { prisma } from '@repo/database';
import { soldProductName } from '@/lib/products/sold';
import { getNumber } from '@/lib/settings/store';
import { notifyTelegram, notifyOffice } from './notify';
import { detach } from '@/lib/background';

// ══════════════════════════════════════════════════════════════════════
// Побочные эффекты после создания заказа. Вынесено из api/orders/route.ts.
//
// Общее свойство всего, что здесь лежит: ни один сбой не имеет права
// уронить оформление. Заказ уже создан и оплачен решением клиента —
// списание остатка, уведомления и реферальный бонус только досылаются.
// Поэтому каждый блок в своём try, а notifyOffice вообще не ждём.
// ══════════════════════════════════════════════════════════════════════

type CreatedOrder = Awaited<ReturnType<typeof prisma.order.create>> & {
  /**
   * `productId` и `product` нулевые: товар мог быть удалён из каталога после
   * заказа (`onDelete: SetNull`). У ТОЛЬКО ЧТО созданного заказа они всегда
   * заполнены — тип честен ради тех, кто читает заказ позже.
   */
  items: {
    productId: string | null;
    productName: string | null;
    quantity: number;
    price: number;
    product: { nameUz: string } | null;
  }[];
};
type OrderUser = Awaited<ReturnType<typeof prisma.user.findUniqueOrThrow>>;

export async function runAfterCreate(
  order: CreatedOrder,
  user: OrderUser,
  customerName: string,
): Promise<void> {
// Auto-deduct stock — ATOMIC guarded decrement so simultaneous orders can never
// drive stock negative (oversell). Microgreens are grown-to-order, so an order
// beyond current stock is accepted but flagged as backorder and stock clamps at 0.
const lowStockAlerts: string[] = [];
const lowStockThreshold = await getNumber('stock.lowStockAlert');
try {
  for (const item of order.items) {
    // Товара может не быть в каталоге: связь обнуляется при окончательном
    // удалении. У только что созданного заказа это невозможно — проверка
    // стоит потому, что тип теперь честен, а `!` вернул бы ровно ту
    // уверенность, из-за которой история и терялась.
    const productId = item.productId;
    if (!productId) continue;

    // Остаток ДО списания нужен, чтобы не кричать о том, что и так было
    // известно. С переходом каталога на прайс все остатки стали нулевыми, и
    // предупреждение «zaxira tugadi» уходило бы на каждый заказ по каждой
    // позиции — то есть перестало бы что-либо значить.
    const before = (await prisma.product.findUnique({
      where: { id: productId },
      select: { stock: true },
    }))?.stock ?? 0;

    const dec = await prisma.product.updateMany({
      where: { id: productId, stock: { gte: item.quantity } },
      data: { stock: { decrement: item.quantity } },
    });
    const soldOut = dec.count === 0;
    await prisma.stockMovement.create({
      data: {
        productId,
        productName: item.productName,
        type: 'OUT',
        quantity: -item.quantity,
        reason: soldOut
          ? `Online buyurtma #${order.orderNumber} (backorder — zaxira yetarli emas)`
          : `Online buyurtma #${order.orderNumber}`,
        orderId: order.id,
        performedBy: 'System',
        // Деловая дата онлайн-заказа — время его оформления.
        soldAt: order.createdAt,
      },
    });
    if (soldOut) {
      // Never go negative — clamp remaining stock to zero (idempotent under races).
      await prisma.product.updateMany({ where: { id: productId, stock: { gt: 0 } }, data: { stock: 0 } });
      // Товар, который и до заказа лежал на нуле, — это обычный «под заказ»,
      // а не событие. Пишем, только если запас именно СЕЙЧАС кончился.
      if (before > 0) {
        lowStockAlerts.push(`⚠️ ${soldProductName(item)} — zaxira tugadi (backorder)!`);
      }
    } else {
      const fresh = await prisma.product.findUnique({ where: { id: productId }, select: { stock: true } });
      if (fresh && fresh.stock <= lowStockThreshold && before > lowStockThreshold) {
        lowStockAlerts.push(`⚠️ ${soldProductName(item)} — faqat ${fresh.stock} dona qoldi!`);
      }
    }
  }
} catch (stockErr) {
  console.error('Stock deduction error (order still created):', stockErr);
}

// Дальше — только уведомления, и ни одно из них не ждём.
//
// Заказ создан, остаток списан, движение записано — с точки зрения учёта всё
// готово ещё до этой строки. А ниже три HTTP-вызова наружу: два в Telegram и
// один в ИИ-офис, каждый со своим таймаутом. Раньше два из трёх ждались, и
// покупатель на кнопке «оформить» стоял ровно столько, сколько Telegram
// отвечал в этот момент. Правило записано в шапке файла с самого начала —
// следовал ему только `notifyOffice`.

// Send low-stock alerts to Telegram
if (lowStockAlerts.length > 0) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const adminChatId = process.env.ADMIN_CHAT_ID;
  if (token && adminChatId) {
    const alertMsg = `🔴 <b>Kam qolgan tovarlar!</b>\n\n${lowStockAlerts.join('\n')}\n\n📦 Buyurtma: #${order.orderNumber}`;
    detach(
      'предупреждение об остатках',
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: adminChatId, text: alertMsg, parse_mode: 'HTML' }),
      }),
    );
  }
}

// Send notification to Telegram bot
detach(`заказ #${order.orderNumber} в Telegram`, notifyTelegram(order, customerName));

// Mirror into the AI-office CRM + fire ORDER_CREATED so Stepan and the
// department bots (Finance/PM/Analytics) actually see this order.
detach(`заказ #${order.orderNumber} в офис`, notifyOffice(order, user));


// Кэшбэк пригласившему. Процент задаётся в админке (bonus.referralPercent):
// раньше 3% были вписаны здесь числом, а клиенту показывались отдельной
// константой в /api/referral — две цифры могли разойтись незаметно.
try {
  if (user.referredBy) {
    const referrer = await prisma.user.findFirst({
      where: { referralCode: user.referredBy },
    });
    if (referrer) {
      const percent = await getNumber('bonus.referralPercent');
      const bonus = Math.round(order.total * (percent / 100));
      await prisma.user.update({
        where: { id: referrer.id },
        data: { bonusPoints: { increment: bonus } },
      });
      console.log(`Referral bonus: +${bonus} to ${referrer.firstName} (from order ${order.orderNumber})`);
    }
  }
} catch (refErr) {
  console.error('Referral bonus error:', refErr);
}
}

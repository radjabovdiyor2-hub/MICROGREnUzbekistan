import { prisma } from '@repo/database';
import { getNumber } from '@/lib/settings/store';
import { notifyTelegram, notifyOffice } from './notify';

// ══════════════════════════════════════════════════════════════════════
// Побочные эффекты после создания заказа. Вынесено из api/orders/route.ts.
//
// Общее свойство всего, что здесь лежит: ни один сбой не имеет права
// уронить оформление. Заказ уже создан и оплачен решением клиента —
// списание остатка, уведомления и реферальный бонус только досылаются.
// Поэтому каждый блок в своём try, а notifyOffice вообще не ждём.
// ══════════════════════════════════════════════════════════════════════

type CreatedOrder = Awaited<ReturnType<typeof prisma.order.create>> & {
  items: { productId: string; quantity: number; price: number; product: { nameUz: string } }[];
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
    // Остаток ДО списания нужен, чтобы не кричать о том, что и так было
    // известно. С переходом каталога на прайс все остатки стали нулевыми, и
    // предупреждение «zaxira tugadi» уходило бы на каждый заказ по каждой
    // позиции — то есть перестало бы что-либо значить.
    const before = (await prisma.product.findUnique({
      where: { id: item.productId },
      select: { stock: true },
    }))?.stock ?? 0;

    const dec = await prisma.product.updateMany({
      where: { id: item.productId, stock: { gte: item.quantity } },
      data: { stock: { decrement: item.quantity } },
    });
    const soldOut = dec.count === 0;
    await prisma.stockMovement.create({
      data: {
        productId: item.productId,
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
      await prisma.product.updateMany({ where: { id: item.productId, stock: { gt: 0 } }, data: { stock: 0 } });
      // Товар, который и до заказа лежал на нуле, — это обычный «под заказ»,
      // а не событие. Пишем, только если запас именно СЕЙЧАС кончился.
      if (before > 0) {
        lowStockAlerts.push(`⚠️ ${item.product.nameUz} — zaxira tugadi (backorder)!`);
      }
    } else {
      const fresh = await prisma.product.findUnique({ where: { id: item.productId }, select: { stock: true } });
      if (fresh && fresh.stock <= lowStockThreshold && before > lowStockThreshold) {
        lowStockAlerts.push(`⚠️ ${item.product.nameUz} — faqat ${fresh.stock} dona qoldi!`);
      }
    }
  }
} catch (stockErr) {
  console.error('Stock deduction error (order still created):', stockErr);
}

// Send low-stock alerts to Telegram
if (lowStockAlerts.length > 0) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const adminChatId = process.env.ADMIN_CHAT_ID;
  if (token && adminChatId) {
    const alertMsg = `🔴 <b>Kam qolgan tovarlar!</b>\n\n${lowStockAlerts.join('\n')}\n\n📦 Buyurtma: #${order.orderNumber}`;
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: adminChatId, text: alertMsg, parse_mode: 'HTML' }),
      });
    } catch (e) { console.error('Low stock alert error:', e); }
  }
}

// Send notification to Telegram bot
await notifyTelegram(order, customerName);

// Mirror into the AI-office CRM + fire ORDER_CREATED so Stepan and the
// department bots (Finance/PM/Analytics) actually see this order.
// Run in background without awaiting to ensure fast checkout for the user.
notifyOffice(order, user).catch(console.error);


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

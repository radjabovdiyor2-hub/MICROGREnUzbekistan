// ==========================================
// Order lifecycle sync — keep the storefront (microgreen_db) and the AI-office
// CRM (microgreen) in step, and keep the customer informed.
//
// Direction handled here: storefront -> office + customer.
//   When an order's status changes on the storefront side (web admin or the
//   storefront bot's admin buttons) we:
//     1. DM the customer the new status via the storefront bot, and
//     2. push the change to web_office /ingest/order-status, which updates
//        microgreen.orders and fires ORDER_STATUS_CHANGED for Stepan/Analytics.
//
// The reverse direction (office -> storefront) lives in /api/orders/status,
// which the office calls; it must NOT call back here, so no loop forms.
// ==========================================

import { notifyCustomer } from './notify';
import { restoreStockForCancelledOrder } from './orders/cancel';

// Storefront status (Prisma OrderStatus) -> customer-facing bilingual message.
const STATUS_MESSAGE: Record<string, { uz: string; ru: string }> = {
  PENDING: { uz: 'qabul qilindi ✅', ru: 'принят ✅' },
  CONFIRMED: { uz: 'tasdiqlandi 👍', ru: 'подтверждён 👍' },
  PREPARING: { uz: 'tayyorlanmoqda 👨‍🍳', ru: 'готовится 👨‍🍳' },
  DELIVERING: { uz: "yo'lda 🚚", ru: 'в пути 🚚' },
  DELIVERED: { uz: 'yetkazib berildi 🎉', ru: 'доставлен 🎉' },
  CANCELLED: { uz: 'bekor qilindi ❌', ru: 'отменён ❌' },
};

// Storefront status (Prisma) -> office status (microgreen.orders CHECK values).
const STATUS_TO_OFFICE: Record<string, string> = {
  PENDING: 'new',
  CONFIRMED: 'confirmed',
  PREPARING: 'preparing',
  DELIVERING: 'delivering',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
};

// Prisma PaymentStatus -> office payment_status (CHECK: pending|paid|overdue).
const PAYMENT_TO_OFFICE: Record<string, string> = {
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'overdue',
  REFUNDED: 'pending',
};

export function customerStatusText(
  orderNumber: string,
  status: string,
  language?: string | null,
): string {
  const m = STATUS_MESSAGE[status];
  if (!m) return `📦 Buyurtma #${orderNumber}: ${status}`;
  // Prefer the customer's language, but always give both so nothing is lost.
  const primary = language === 'ru' ? m.ru : m.uz;
  const secondary = language === 'ru' ? m.uz : m.ru;
  return `📦 <b>#${orderNumber}</b>\n${primary}\n<i>${secondary}</i>`;
}

// Push status to the AI-office with retry. Best-effort: never throws.
export async function pushStatusToOffice(params: {
  orderNumber: string;
  status?: string | null;
  paymentStatus?: string | null;
}): Promise<void> {
  const url =
    process.env.OFFICE_STATUS_URL ||
    process.env.OFFICE_INGEST_URL?.replace(/\/order$/, '/order-status');
  if (!url) return;

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.INGEST_SECRET ? { 'X-Ingest-Secret': process.env.INGEST_SECRET } : {}),
        },
        body: JSON.stringify({
          order_number: params.orderNumber,
          status: params.status ? STATUS_TO_OFFICE[params.status] ?? null : null,
          payment_status: params.paymentStatus ? PAYMENT_TO_OFFICE[params.paymentStatus] ?? null : null,
        }),
        signal: AbortSignal.timeout(4000),
      });
      if (!response.ok) throw new Error(`Office returned ${response.status}`);
      return;
    } catch (err) {
      if (attempt === maxRetries) {
        console.error('Office status sync failed after 3 attempts (order still updated):', err);
      } else {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }
}

// One call for a storefront-side status change: notify the customer + sync office.
//
// Отмена дополнительно возвращает товар на склад. Место выбрано намеренно:
// сюда сходятся все три пути отмены (админка, PUT /api/orders и обратная
// синхронизация из офиса), поэтому возврат не может оказаться забытым на
// одном из них — а именно так он и отсутствовал раньше на всех трёх.
export async function syncOrderStatus(order: {
  id?: string;
  orderNumber: string;
  status: string;
  paymentStatus?: string | null;
  user?: { telegramId: bigint | null; language: string | null } | null;
}): Promise<void> {
  await Promise.allSettled([
    order.user?.telegramId
      ? notifyCustomer(order.user.telegramId, customerStatusText(order.orderNumber, order.status, order.user.language))
      : Promise.resolve(false),
    pushStatusToOffice({
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus ?? null,
    }),
    order.status === 'CANCELLED' && order.id
      ? restoreStockForCancelledOrder(order.id).catch((err) =>
          console.error('Stock restore on cancel failed:', err),
        )
      : Promise.resolve(0),
  ]);
}

// Payment confirmed (from a payment-provider webhook): thank the customer and
// mark the order paid in the office CRM (Finance sees payment_status='paid').
export async function syncOrderPaid(order: {
  orderNumber: string;
  status: string;
  user?: { telegramId: bigint | null; language: string | null } | null;
}): Promise<void> {
  const msg = `💳 <b>#${order.orderNumber}</b>\nTo‘lov qabul qilindi ✅\n<i>Оплата получена</i>`;
  await Promise.allSettled([
    order.user?.telegramId ? notifyCustomer(order.user.telegramId, msg) : Promise.resolve(false),
    pushStatusToOffice({ orderNumber: order.orderNumber, status: order.status, paymentStatus: 'PAID' }),
  ]);
}

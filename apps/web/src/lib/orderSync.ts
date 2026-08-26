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
import { restoreStockForCancelledOrder, reapplyStockForRevivedOrder } from './orders/cancel';
import { prisma } from '@repo/database';

import { drainOffice, enqueueOffice } from './office/outbox';
import { detach } from '@/lib/background';
import { pushToUser } from './push/send';

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
  // `OFFICE_STATUS_URL` — исторический явный адрес (он задан в проде), дальше
  // общая цепочка `ingestUrl`. Третьей ступени (вывод из `WEB_OFFICE_URL`)
  // здесь не было, и развёртывание, где задан только общий адрес офиса, молча
  // теряло ВСЮ синхронизацию статусов заказов в CRM — при том, что соседний
  // `ingestUrl` эту ступень уже имеет, и добавлена она была ровно по этой
  // причине.
  // Через очередь, а не тремя попытками подряд.
  //
  // Прежние три попытки покрывали моргнувшую сеть; офис, лежащий десять
  // минут, означал заказ, который на сайте «доставлен», а в CRM навсегда
  // «новый». Для финансов это неучтённый доход, для Стёпана — висящая
  // задача, для клиента — звонок «а где мой заказ».
  //
  // Ключ очереди — номер заказа И статус: два разных перехода одного
  // заказа это два события, и второй не должен затирать первый.
  const payload = {
          order_number: params.orderNumber,
          // Возврат для офиса — это отменённая продажа. Своего значения
          // `refunded` у него нет: CHECK на `crm_orders.payment_status`
          // допускает только pending|paid|overdue. Поэтому сообщаем отменой —
          // иначе офис не сторнирует доход, и возвращённый заказ навсегда
          // остаётся прибылью в P&L.
          status:
            params.paymentStatus === 'REFUNDED'
              ? 'cancelled'
              : params.status
                ? STATUS_TO_OFFICE[params.status] ?? null
                : null,
          payment_status: params.paymentStatus ? PAYMENT_TO_OFFICE[params.paymentStatus] ?? null : null,
  };

  try {
    await enqueueOffice(prisma, {
      topic: 'order-status',
      refKey: `${params.orderNumber}:${params.status ?? ''}:${params.paymentStatus ?? ''}`,
      payload,
    });
  } catch (err) {
    // Отказ базы, а не офиса. Статус на сайте уже изменён — ронять ответ
    // нельзя, но потеря синхронизации обязана быть видимой.
    console.error('Office status sync not queued (order still updated):', err);
    return;
  }

  await drainOffice();
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
  userId?: string | null;
  user?: { telegramId: bigint | null; language: string | null } | null;
}): Promise<void> {
  // Уведомления — В ФОНЕ, склад — в запросе.
  //
  // Раньше ждали всё скопом, и `pushStatusToOffice` с тремя ретраями по
  // 4 секунды держал ответ до пятнадцати секунд при недоступном офисе.
  // Заказ к тому моменту уже был изменён: владелец смотрел на замерший
  // экран, ожидая доставки уведомления, которое его не касается.
  //
  // Возврат товара на склад остаётся здесь и ждётся: от него зависят
  // остатки и бонусы, а не чья-то осведомлённость.
  if (order.user?.telegramId) {
    detach(
      `статус ${order.orderNumber} клиенту`,
      notifyCustomer(order.user.telegramId, customerStatusText(order.orderNumber, order.status, order.user.language)),
    );
  }
  // Браузер покупателя — второй канал, и для многих единственный: без
  // Telegram человек узнавал о доставке, когда курьер звонил в дверь.
  // В фоне и по той же причине, что и остальные уведомления: осведомлённость
  // не должна держать ответ.
  if (order.userId) {
    detach(
      `push ${order.orderNumber} клиенту`,
      pushToUser(order.userId).then(() => undefined),
    );
  }

  detach(
    `статус ${order.orderNumber} в офис`,
    pushStatusToOffice({
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus ?? null,
    }),
  );

  await Promise.allSettled([
    // Возврат обрабатывается как отмена. Раньше `REFUNDED` не имел
    // обработчика вовсе: деньги возвращали клиенту, а товар оставался
    // списанным, бонусы — сгоревшими, доход — записанным.
    //
    // Обратный переход — тоже событие: заказ, снятый с отмены, обязан снова
    // списать остаток и забрать возвращённые баллы. Само по себе
    // `reapplyStockForRevivedOrder` безопасно для заказов, которые никогда не
    // отменяли: оно считает пары «вернули/забрали» и без открытого возврата
    // не делает ничего.
    (order.status === 'CANCELLED' || order.paymentStatus === 'REFUNDED') && order.id
      ? restoreStockForCancelledOrder(order.id).catch((err) =>
          console.error('Stock restore on cancel/refund failed:', err),
        )
      : order.id
        ? reapplyStockForRevivedOrder(order.id).catch((err) =>
            console.error('Stock re-apply on un-cancel failed:', err),
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

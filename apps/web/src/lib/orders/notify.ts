import crypto from 'crypto';
import { prisma } from '@repo/database';
import { soldProductName } from '@/lib/products/sold';
import { audit } from '@/lib/audit';
import { inc } from '@/lib/metrics';
import { formatLocalDate } from '@/lib/revenue/salesLedger';
import { drainOffice, enqueueOffice } from '@/lib/office/outbox';
import { openKeyboard } from '@/lib/telegram/adminLinks';
import { alertCrmSyncFailed } from './crmAlert';

// Вынесено из api/orders/route.ts: файл перерос 200 строк, а Next.js
// разрешает в route.ts экспортировать только HTTP-обработчики.

// Generate order number
export function generateOrderNumber(): string {
  const now = new Date();
  // Дата в номере — местная. По UTC заказ, оформленный 12 августа в 02:00,
  // получал номер `M-20260811-…`, и по дате его не находили.
  const date = formatLocalDate(now).replace(/-/g, '');
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  const ms = now.getTime().toString(36).slice(-4).toUpperCase();
  return `M-${date}-${rand}${ms}`;
}

// Helper to send message to Telegram Admin
export async function notifyTelegram(order: {
  orderNumber: string;
  phone: string;
  address: string;
  note: string | null;
  total: number;
  deliveryFee: number;
  paymentMethod: string;
  /** Товар мог быть удалён из каталога — подпись берётся из снимка. */
  items: { quantity: number; price: number; productName: string | null; product: { nameUz: string } | null }[];
}, customerName: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const adminChatId = process.env.ADMIN_CHAT_ID;

  if (!token || !adminChatId) {
    console.warn('Telegram notification skipped: Missing TELEGRAM_BOT_TOKEN or ADMIN_CHAT_ID in .env');
    audit({ action: 'order.notify.skipped', target: order.orderNumber, meta: { reason: 'not configured' } });
    inc('mg_order_notify_failed_total', 'Заказы, о которых не удалось уведомить', { channel: 'telegram' });
    return;
  }

  const itemsList = order.items.map(i => `▫️ ${i.quantity}x ${soldProductName(i)} — ${i.price.toLocaleString('ru-RU')} sum`).join('\n');
  const message = `
🛍 <b>Yangi buyurtma: #${order.orderNumber}</b>

👤 <b>Mijoz:</b> ${customerName}
📞 <b>Telefon:</b> ${order.phone}
📍 <b>Manzil:</b> ${order.address}
📝 <b>Izoh:</b> ${order.note || 'Yoq'}

📦 <b>Mahsulotlar:</b>
${itemsList}

💰 <b>Yetkazib berish:</b> ${order.deliveryFee.toLocaleString('ru-RU')} sum
💳 <b>To'lov usuli:</b> ${order.paymentMethod === 'cash' ? '💳 Naqd/Otkazma' : order.paymentMethod}
💵 <b>Umumiy summa: ${order.total.toLocaleString('ru-RU')} sum</b>
  `;

  // ADMIN_CHAT_ID может содержать несколько получателей через запятую.
  // Раньше подразумевался ровно один: пока владелец в отпуске или заблокировал
  // бота, о новом заказе не узнавал никто, хотя в базе он лежал.
  const recipients = adminChatId.split(',').map((s) => s.trim()).filter(Boolean);

  let delivered = 0;

  for (const chatId of recipients) {
    // Две попытки: разовый сетевой сбой не должен стоить уведомления о заказе.
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML',
            // Номер заказа в тексте был всегда, а открыть заказ можно было
            // только зайдя на сайт и найдя вкладку глазами. Кнопка ведёт
            // прямо в него: `focus` у экрана заказов принимает и номер.
            reply_markup: openKeyboard(chatId, 'orders', order.orderNumber, '📦 Открыть заказ'),
            // Иначе Telegram подрисует под уведомлением карточку сайта.
            disable_web_page_preview: true,
          }),
          signal: AbortSignal.timeout(5000),
        });

        // Ответ обязательно проверяем: Telegram отвечает 400/403 на
        // заблокированного бота или неверный chat_id, и без этой проверки
        // недоставленное уведомление считалось успешным.
        if (res.ok) {
          delivered += 1;
          break;
        }

        const detail = await res.text().catch(() => '');
        console.error(`Telegram sendMessage → ${res.status} для chat_id=${chatId}: ${detail.slice(0, 200)}`);
        if (res.status >= 400 && res.status < 500) break; // повтор не поможет
      } catch (err) {
        console.error(`Telegram notification attempt ${attempt} failed for ${chatId}:`, err);
      }

      if (attempt === 1) await new Promise((r) => setTimeout(r, 1000));
    }
  }

  if (delivered === 0) {
    // Заказ в базе есть, но операционно его никто не видит — это и есть
    // сценарий «заказ пропал». Оставляем след в журнале и в метриках,
    // чтобы сработал алерт, а не тишина.
    console.error(`ORDER NOT DELIVERED to any admin: ${order.orderNumber}`);
    audit({
      action: 'order.notify.failed',
      target: order.orderNumber,
      meta: { recipients: recipients.length },
    });
    inc('mg_order_notify_failed_total', 'Заказы, о которых не удалось уведомить', { channel: 'telegram' });
  }
}

/**
 * Покупатель чека глазами CRM офиса.
 *
 * `id` — карточка `customers`, выбранная человеком в кассе. Это САМЫЙ
 * надёжный ключ: офис сопоставляет клиента по цепочке
 * `customer_id → web_user_id → telegram_id → телефон → имя`, и раньше POS не
 * давал ни одного из них. Оставалось имя — а имя было захардкожено строкой
 * «Покупатель в магазине», поэтому ВСЕ продажи за прилавком, включая продажи
 * конкретному ресторану, сваливались на одну фиктивную карточку.
 */
export interface PosMirrorCustomer {
  id: number | null;
  name: string | null;
  phone: string | null;
  address: string | null;
}

interface PosMirrorItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
}

/** Блок `customer` тела `/ingest/order`. */
function mirrorCustomer(customer: PosMirrorCustomer) {
  return {
    // Имя-заглушка остаётся только там, где покупателя действительно не
    // назвали: розница как контрагент — это честно, «VIP-клиент Покупатель
    // в магазине» — нет.
    name: customer.name || 'Покупатель в магазине',
    phone: customer.phone || null,
    customer_id: customer.id,
  };
}

/**
 * Продажа в точке — тело для `/ingest/order`.
 *
 * Касса не создаёт `orders`: она пишет складские движения и, при продаже в
 * долг, строку долга. Из-за этого POS был невидим для офиса целиком — ни
 * Стёпан, ни финансы, ни аналитика отделов о нём не знали, а в P&L выручка
 * магазина не попадала вовсе.
 *
 * Мост тот же, что у онлайн-заказа: `/ingest/order` создаёт `crm_orders`,
 * пересчитывает счётчики карточки и публикует ORDER_CREATED, откуда финансы
 * записывают доход. Двойного счёта не возникает — витринные отчёты считают
 * кассу по складским движениям (lib/revenue), а офисные по `crm_orders`;
 * пересечения между таблицами нет.
 *
 * Функция ЧИСТАЯ: отправкой и повторами занимается lib/office/outbox. Раньше
 * запрос уходил прямо отсюда с `.catch(() => {})`, и недоступный офис означал
 * навсегда потерянную привязку чека к клиенту.
 */
export function posSaleIngestBody(sale: {
  saleNumber: string;
  total: number;
  /**
   * Деловая дата продажи в ISO.
   *
   * Без неё офис ставил продаже `NOW()`, и продажа, проведённая сегодня за
   * вчера, попадала у витрины во вчерашний день, а у офиса — в сегодняшний.
   * Это ровно то расхождение отчётов, ради устранения которого написан
   * lib/revenue/salesLedger.
   */
  soldAt?: string;
  paymentMethod: string;
  /** `counter` — за прилавком, `field` — с выезда по карте. */
  origin: 'counter' | 'field';
  customer: PosMirrorCustomer;
  items: PosMirrorItem[];
}): Record<string, unknown> {
  const field = sale.origin === 'field';

  return {
    order_number: sale.saleNumber,
    customer: mirrorCustomer(sale.customer),
    total_amount: sale.total,
    created_at: sale.soldAt ?? null,
    delivery_fee: 0,
    discount_amount: 0,
    payment_method: sale.paymentMethod,
    // Выезд к клиенту — не «продажа в магазине». Адрес карточки здесь важнее
    // ярлыка: по нему в CRM видно, куда именно возили товар.
    delivery_address: field
      ? sale.customer.address || 'Продажа на выезде'
      : 'Продажа в магазине',
    items_summary: sale.items.map((i) => `${i.name} x${i.quantity}`).join(', '),
    items: sale.items.map((i) => ({
      storefront_id: i.productId,
      name: i.name,
      quantity: i.quantity,
      price: i.price,
    })),
    notes: field ? 'Продажа на выезде (карта)' : 'Продажа в магазине (POS)',
  };
}

/**
 * Возврат — тело для `/ingest/order` с ОТРИЦАТЕЛЬНОЙ суммой.
 *
 * Возврат не зеркалился вовсе: деньги отдавали покупателю, а в `total_spent`
 * его карточки они оставались навсегда.
 *
 * Почему отдельный заказ с минусом, а не отмена исходного: возврат бывает
 * ЧАСТИЧНЫМ — вернули две пачки из пяти. Отмена вычла бы весь чек, а
 * формула офиса суммирует `total_amount`, поэтому минус уменьшает сумму
 * ровно на возвращённое. Число заказов при этом не растёт: `recalc` считает
 * только неотрицательные строки.
 */
export function posRefundIngestBody(refund: {
  returnNumber: string;
  /** Номер чека, из которого возвращают. */
  saleNumber: string;
  /** Сумма возврата ПОЛОЖИТЕЛЬНЫМ числом — знак ставится здесь. */
  totalRefund: number;
  refundedAt: string;
  reason: string | null;
  customer: PosMirrorCustomer;
  items: PosMirrorItem[];
}): Record<string, unknown> {
  return {
    order_number: refund.returnNumber,
    customer: mirrorCustomer(refund.customer),
    total_amount: -Math.abs(refund.totalRefund),
    created_at: refund.refundedAt,
    delivery_fee: 0,
    discount_amount: 0,
    payment_method: 'cash',
    delivery_address: 'Возврат',
    items_summary: refund.items.map((i) => `${i.name} x-${i.quantity}`).join(', '),
    // Количество тоже с минусом: `total_price = quantity × price`, и без
    // знака позиции возврата сложились бы в аналитике как продажи.
    items: refund.items.map((i) => ({
      storefront_id: i.productId,
      name: i.name,
      quantity: -Math.abs(i.quantity),
      price: i.price,
    })),
    notes:
      `Возврат по чеку ${refund.saleNumber}` +
      (refund.reason ? `: ${refund.reason}` : ''),
  };
}
// Bridge the order into the tgas AI-office CRM.
// The database is shared, but the tables are not: the storefront owns `orders`,
// while the bots and the office dashboard read the CRM mirror (`crm_orders`).
// Without this hop Stepan and the department bots never see an order. The
// web_office ingest endpoint mirrors it and fires ORDER_CREATED on the internal
// event bus — for every order, including sales the AI-office registers itself,
// which now also go through POST /api/orders.
// Best-effort: a failure here must not fail the customer's checkout.
export async function notifyOffice(
  order: {
    orderNumber: string;
    phone: string;
    address: string;
    note: string | null;
    total: number;
    deliveryFee: number;
    discount: number;
    paymentMethod: string;
    city: string;
    items: {
      productId: string | null;
      productName: string | null;
      quantity: number;
      price: number;
      product: { nameUz: string } | null;
    }[];
  },
  user: { id: string; firstName: string | null; lastName: string | null; telegramId: bigint | null; bonusPoints: number },
) {
  // Проверки `OFFICE_INGEST_URL` здесь больше нет — и это не упрощение.
  //
  // Она отказывалась ставить заказ в очередь, если задана только общая
  // переменная `WEB_OFFICE_URL`: на таком развёртывании КАЖДЫЙ заказ
  // проходил мимо CRM, а сайт выглядел здоровым. Адрес теперь разрешает
  // `ingestUrl()` внутри очереди — там цепочка из трёх ступеней, ровно та,
  // что уже стоит у синхронизации статусов (`orderSync.ts`).
  //
  // Недоступный адрес при этом не теряется: очередь повторит и, если офис
  // так и не ответит, поднимет тревогу владельцу — то есть ненастроенный
  // мост по-прежнему виден, но заказ при этом остаётся в очереди, а не
  // выбрасывается.
  const itemsSummary = order.items
    .map((i) => `${soldProductName(i)} x${i.quantity}`)
    .join(', ');
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || null;

  // ── Заказ уходит в CRM ЧЕРЕЗ ОЧЕРЕДЬ, а не тремя попытками подряд ──
  //
  // Прежние три попытки по четыре секунды покрывали моргнувшую сеть и
  // ничего больше: офис, лежащий десять минут, означал заказ, которого в
  // CRM нет НАВСЕГДА. Ни Стёпан, ни финансы, ни аналитика его не увидят, а
  // карточка клиента не узнает о покупке — при том, что на сайте заказ
  // есть и покупатель его ждёт.
  //
  // Очередь (`lib/office/outbox`) хранит обещание в базе и повторяет с
  // нарастающей паузой, пока не доставит. Та же дверь и те же правила, что
  // у продаж кассы: 401/403 — чинится настройкой, повторяем; прочие 4xx —
  // отказ по существу, снимаем и кричим.
  //
  // ЧЕСТНАЯ ОГОВОРКА: строка пишется ПОСЛЕ транзакции заказа, а не внутри
  // неё — путь создания заказа принадлежит другому месту, и лезть в него
  // отсюда нельзя. Остаётся узкое окно: падение процесса между записью
  // заказа и постановкой в очередь. Это несравнимо уже прежнего «офис
  // недоступен минуту — заказ потерян».
  const payload = {
          order_number: order.orderNumber,
          customer: {
            name,
            phone: order.phone,
            telegram_id: user.telegramId ? user.telegramId.toString() : null,
            bonus_balance: user.bonusPoints,
            // Связка Customer(CRM) ↔ User(витрина). Колонка customers.web_user_id
            // появилась при объединении баз, но её никто не заполнял: один и тот
            // же покупатель оставался двумя несвязанными карточками.
            web_user_id: user.id,
          },
          total_amount: order.total,
          delivery_fee: order.deliveryFee,
          discount_amount: order.discount,
          payment_method: order.paymentMethod,
          delivery_address: order.address,
          city: order.city,
          items_summary: itemsSummary,
          items: order.items.map((i) => ({
            storefront_id: i.productId,
            name: soldProductName(i),
            quantity: i.quantity,
            price: i.price,
          })),
          notes: order.note || '',
  };

  try {
    await enqueueOffice(prisma, {
      topic: 'order',
      refKey: order.orderNumber,
      payload,
    });
  } catch (err) {
    // Очередь недоступна — это отказ базы, а не офиса. Заказ уже создан,
    // ронять ответ покупателю нельзя, но молчать тем более.
    console.error('AI-office ingest not queued (order still created):', err);
    audit({ action: 'order.crm_sync.failed', target: order.orderNumber });
    inc('mg_order_notify_failed_total', 'Заказы, о которых не удалось уведомить', { channel: 'crm' });
    void alertCrmSyncFailed({
      target: order.orderNumber,
      channel: 'order',
      reason: err instanceof Error ? err.message : undefined,
    });
    return;
  }

  // Отправка сразу же: очередь — страховка, а не задержка. Заодно уходит
  // всё, что накопилось, пока офис лежал.
  await drainOffice();
}

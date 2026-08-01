import crypto from 'crypto';
import { audit } from '@/lib/audit';
import { inc } from '@/lib/metrics';

// Вынесено из api/orders/route.ts: файл перерос 200 строк, а Next.js
// разрешает в route.ts экспортировать только HTTP-обработчики.

// Generate order number
export function generateOrderNumber(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
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
  items: { quantity: number; price: number; product: { nameUz: string } }[];
}, customerName: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const adminChatId = process.env.ADMIN_CHAT_ID;

  if (!token || !adminChatId) {
    console.warn('Telegram notification skipped: Missing TELEGRAM_BOT_TOKEN or ADMIN_CHAT_ID in .env');
    audit({ action: 'order.notify.skipped', target: order.orderNumber, meta: { reason: 'not configured' } });
    inc('mg_order_notify_failed_total', 'Заказы, о которых не удалось уведомить', { channel: 'telegram' });
    return;
  }

  const itemsList = order.items.map(i => `▫️ ${i.quantity}x ${i.product.nameUz} — ${i.price.toLocaleString('ru-RU')} sum`).join('\n');
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
          body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
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

// Bridge the order into the tgas AI-office CRM (a separate `microgreen` DB).
// The storefront and the AI-office live in different databases, so without this
// hop Stepan and the department bots never see app orders. The web_office ingest
// endpoint mirrors the order into the CRM and fires ORDER_CREATED on the internal
// event bus. Best-effort: a failure here must not fail the customer's checkout.
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
    items: { productId: string; quantity: number; price: number; product: { nameUz: string } }[];
  },
  user: { firstName: string | null; lastName: string | null; telegramId: bigint | null; bonusPoints: number },
) {
  const url = process.env.OFFICE_INGEST_URL; // e.g. http://web_office:8050/ingest/order
  if (!url) {
    console.warn('AI-office ingest skipped: OFFICE_INGEST_URL not set');
    return;
  }

  const itemsSummary = order.items
    .map((i) => `${i.product.nameUz} x${i.quantity}`)
    .join(', ');
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || null;

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
          order_number: order.orderNumber,
          customer: {
            name,
            phone: order.phone,
            telegram_id: user.telegramId ? user.telegramId.toString() : null,
            bonus_balance: user.bonusPoints,
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
            name: i.product.nameUz,
            quantity: i.quantity,
            price: i.price,
          })),
          notes: order.note || '',
        }),
        signal: AbortSignal.timeout(4000),
      });

      if (!response.ok) {
        throw new Error(`Office CRM returned status ${response.status}`);
      }
      return; // Success
    } catch (err) {
      if (attempt === maxRetries) {
        console.error('AI-office ingest failed after 3 attempts (order still created):', err);
        // Заказ создан, но в CRM не попал: Stepan и отделы его не увидят.
        // Раньше это оставалось только строкой в логах.
        audit({ action: 'order.crm_sync.failed', target: order.orderNumber });
        inc('mg_order_notify_failed_total', 'Заказы, о которых не удалось уведомить', { channel: 'crm' });
      } else {
        console.warn(`AI-office ingest attempt ${attempt} failed, retrying in 2s...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }
}

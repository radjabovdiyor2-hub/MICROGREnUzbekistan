// ==========================================
// Telegram Admin Notification Helper
// ==========================================

import { openKeyboard } from '@/lib/telegram/adminLinks';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

type NotifyType = 'sale' | 'order' | 'low_stock' | 'debt' | 'info';

interface NotifyOptions {
  type: NotifyType;
  message: string;
  /** Конкретная запись на экране: номер заказа, id товара. */
  focus?: string;
}

const ICON: Record<NotifyType, string> = {
  sale: '💰',
  order: '📦',
  low_stock: '⚠️',
  debt: '💳',
  info: 'ℹ️',
};

/**
 * Экран, на котором человек разберётся с этим сообщением.
 *
 * Тип уведомления и так объявлен — значит, куда вести, известно заранее, и
 * спрашивать это у вызывающего незачем. Раньше связи не было вовсе: тип
 * выбирал только иконку, а сообщение оставалось тупиком.
 */
const TAB: Record<NotifyType, string> = {
  sale: 'revenue',
  order: 'orders',
  low_stock: 'inventory',
  debt: 'debts',
  info: 'stats',
};

const BUTTON: Record<NotifyType, string> = {
  sale: '💵 Доход',
  order: '📦 Заказы',
  low_stock: '📦 Склад',
  debt: '💳 Долги',
  info: '📊 Сводка',
};

export async function notifyAdmin(opts: NotifyOptions): Promise<boolean> {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) return false;

  const text = `${ICON[opts.type] ?? 'ℹ️'} *Microgreen Admin*\n\n${opts.message}`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text,
        parse_mode: 'Markdown',
        reply_markup: openKeyboard(
          ADMIN_CHAT_ID,
          TAB[opts.type],
          opts.focus,
          BUTTON[opts.type],
        ),
        disable_web_page_preview: true,
      }),
    });
    return res.ok;
  } catch (e) {
    console.error('[Notify] Telegram send failed:', e);
    return false;
  }
}

// Notify the CUSTOMER (not the admin) via the storefront bot they already talk
// to. The internal AI-office bots can't reliably DM a customer (the customer may
// never have started them), so status updates go out through TELEGRAM_BOT_TOKEN.
export async function notifyCustomer(
  telegramId: bigint | number | string | null | undefined,
  message: string,
): Promise<boolean> {
  if (!BOT_TOKEN || !telegramId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramId.toString(),
        text: message,
        parse_mode: 'HTML',
      }),
    });
    return res.ok;
  } catch (e) {
    console.error('[Notify] Customer send failed:', e);
    return false;
  }
}

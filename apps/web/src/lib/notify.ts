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

/**
 * Отправка владельцу. Возвращает, дошло ли.
 *
 * ⚠️ ПОЧЕМУ ЗДЕСЬ ПРОВЕРЯЕТСЯ `res.ok`, А НЕ ТОЛЬКО `catch`.
 *
 * `fetch` не отклоняется на HTTP-ответе: 400 и 401 приходят как обычный
 * успешный ответ, и `.catch()` на них не срабатывает НИКОГДА. То есть
 * отозванный токен бота — а его уже приходилось менять — выглядит как
 * доставленное сообщение. Уведомления просто перестают приходить, и
 * узнать об этом неоткуда: в логе тихо, в коде видно `catch`.
 *
 * Описание ошибки Telegram кладём в лог целиком: «chat not found» и
 * «Unauthorized» лечатся по-разному, а без текста они неразличимы.
 * Токен в лог не попадает — он только в URL, который мы не печатаем.
 */
async function send(
  text: string,
  parseMode: 'Markdown' | 'HTML',
  chatId: string,
  replyMarkup?: unknown,
): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[Notify] Telegram ответил ${res.status}: ${body.slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[Notify] Telegram send failed:', e);
    return false;
  }
}

/** Сообщение владельцу с кнопкой на нужный экран админки. */
export async function notifyAdmin(opts: NotifyOptions): Promise<boolean> {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) return false;

  return send(
    `${ICON[opts.type] ?? 'ℹ️'} *Microgreen Admin*\n\n${opts.message}`,
    'Markdown',
    ADMIN_CHAT_ID,
    openKeyboard(ADMIN_CHAT_ID, TAB[opts.type], opts.focus, BUTTON[opts.type]),
  );
}

/**
 * Готовое сообщение владельцу — для касс и возвратов.
 *
 * Экран и подпись кнопки они задают сами: у чека это выручка, у возврата —
 * журнал движений, и загонять это в `NotifyType` значило бы придумывать
 * тип под каждую кнопку.
 */
export async function notifyAdminRaw(
  text: string,
  replyMarkup?: unknown,
): Promise<boolean> {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) return false;
  return send(text, 'Markdown', ADMIN_CHAT_ID, replyMarkup);
}

// Notify the CUSTOMER (not the admin) via the storefront bot they already talk
// to. The internal AI-office bots can't reliably DM a customer (the customer may
// never have started them), so status updates go out through TELEGRAM_BOT_TOKEN.
export async function notifyCustomer(
  telegramId: bigint | number | string | null | undefined,
  message: string,
): Promise<boolean> {
  if (!BOT_TOKEN || !telegramId) return false;
  return send(message, 'HTML', telegramId.toString());
}

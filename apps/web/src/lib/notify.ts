// ==========================================
// Telegram Admin Notification Helper
// ==========================================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

interface NotifyOptions {
  type: 'sale' | 'order' | 'low_stock' | 'debt' | 'info';
  message: string;
}

export async function notifyAdmin(opts: NotifyOptions): Promise<boolean> {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) return false;

  const icons: Record<string, string> = {
    sale: '💰',
    order: '📦',
    low_stock: '⚠️',
    debt: '💳',
    info: 'ℹ️',
  };

  const icon = icons[opts.type] || 'ℹ️';
  const text = `${icon} *Microgreen Admin*\n\n${opts.message}`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text,
        parse_mode: 'Markdown',
      }),
    });
    return res.ok;
  } catch (e) {
    console.error('[Notify] Telegram send failed:', e);
    return false;
  }
}

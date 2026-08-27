import { formatQtyWithUnit, lineTotal } from '@/lib/qty';
import { notifyAdminRaw } from '@/lib/notify';
import { openKeyboard } from '@/lib/telegram/adminLinks';
import { formatLocalDate } from '@/lib/revenue/salesLedger';

// Уведомление владельцу о продаже. Вынесено из sale.ts: там осталась
// запись в базу, а сборка сообщения занимала почти треть файла.

export interface NotifyLine {
  name: string;
  unit: string | null;
  quantity: number;
  price: number;
}

export interface NotifyAlert {
  productName: string;
  stock: number;
  unit: string | null;
  level: string;
}

export interface NotifySale {
  saleNumber: string;
  total: number;
  discountApplied: number;
  paymentMethod: string;
  performedBy: string;
  soldAt: Date;
  backdated: boolean;
  backdateReason: string | null;
  lines: NotifyLine[];
  alerts: NotifyAlert[];
}

const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

const PAY_LABEL: Record<string, string> = {
  cash: '💵 Naqd',
  card: '💳 Karta',
  debt: '📝 Qarz',
};

export function buildSaleMessage(sale: NotifySale): string {
  let msg = `💰 *SOTISH #${sale.saleNumber}*\n\n`;
  msg += `👤 ${sale.performedBy} | ${PAY_LABEL[sale.paymentMethod] ?? PAY_LABEL.cash}\n`;
  msg += `🕐 ${sale.soldAt.toLocaleString('uz-UZ', { timeZone: 'Asia/Samarkand', hour: '2-digit', minute: '2-digit' })}\n`;

  // Отдельная строка, а не сноска: дневной отчёт за тот день уже ушёл, и
  // выручка закрытого дня только что изменилась. Владелец должен узнать об
  // этом из самого уведомления, а не заметить расхождение через неделю.
  if (sale.backdated) {
    msg += `⏮ *Orqaga sana:* ${formatLocalDate(sale.soldAt)}`;
    if (sale.backdateReason) msg += ` — ${sale.backdateReason}`;
    msg += '\n';
  }
  msg += '\n';

  for (const line of sale.lines) {
    msg += `• ${line.name} × ${formatQtyWithUnit(line.quantity, line.unit)} = ${fmt(lineTotal(line.price, line.quantity))}\n`;
  }

  if (sale.discountApplied > 0) {
    msg += `\n🏷 Chegirma: −${fmt(sale.discountApplied)}\n`;
  }

  msg += `\n*JAMI: ${fmt(sale.total)} so'm*`;

  if (sale.alerts.length > 0) {
    msg += `\n\n⚠️ *Kam qoldi:*\n`;
    for (const a of sale.alerts) {
      msg += `${a.level === 'CRITICAL' ? '🔴' : '🟡'} ${a.productName} — ${formatQtyWithUnit(a.stock, a.unit)}\n`;
    }
  }

  return msg;
}

/**
 * Отправка best-effort: недоступный Telegram не должен ломать продажу.
 *
 * Экран задаётся вызывающим: у чека это выручка, а у того же чека с
 * предупреждением об остатке — склад. Сообщение об уходящем в ноль товаре
 * без кнопки «Склад» заставляло владельца искать вкладку глазами ровно
 * тогда, когда решение нужно принять сегодня.
 */
export function notifyOwner(
  message: string,
  tab: string = 'revenue',
  buttonText: string = '💵 Доход',
): void {
  const chatId = process.env.ADMIN_CHAT_ID;
  if (!chatId) return;

  // Через общий отправитель, а не своим `fetch(...).catch(() => {})`.
  // Тот `catch` не срабатывал на отказе Telegram вообще: `fetch` не
  // отклоняется на HTTP-ответе, и 401 с отозванным токеном выглядел как
  // доставленный чек. Уведомления о продажах могли не приходить месяцами,
  // и узнать об этом было неоткуда.
  void notifyAdminRaw(message, openKeyboard(chatId, tab, null, buttonText));
}

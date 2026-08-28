import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { loadSalesLedger } from '@/lib/revenue/salesLedger';
import { summarize } from '@/lib/revenue/summary';
import { scanGrowBatches, raiseGrowAlerts, growReportLines } from '@/lib/production/growWatch';
import { alertOverdueDebts } from '@/lib/finance/debtWatch';
import { alertDropouts } from '@/lib/customers/rhythm';
import { alertKpiBreaches } from '@/lib/kpi/watch';
import { openKeyboard } from '@/lib/telegram/adminLinks';

// ==========================================
// Daily Telegram Report — Cron Endpoint
// Called daily via external cron (e.g., cron-job.org)
// GET /api/inventory/cron/daily-report
// ==========================================

export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const adminChatId = process.env.ADMIN_CHAT_ID;

  if (!token || !adminChatId) {
    return NextResponse.json({ error: 'Telegram config missing' }, { status: 500 });
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    // Отчёт считается по общему реестру продаж (lib/revenue) — тому же, что
    // «Сводка», «Доход» и Стёпан. Раньше это было четвёртое определение
    // выручки, и себестоимость в нём бралась ТОЛЬКО по кассе, а делилась на
    // выручку вместе с онлайном — маржа выходила завышенной.
    const summary = summarize(await loadSalesLedger(today, endOfDay), today, endOfDay);

    const onlineRevenue = summary.goodsOnline + summary.delivery - summary.discount;
    const posRevenue = summary.goodsPos - summary.returns;
    const returnAmount = summary.returns;
    const totalRevenue = summary.revenue;
    const totalCost = summary.cost;
    const netProfit = summary.profit;
    const margin = summary.margin;

    // Critical stock items
    const criticalProducts = await prisma.product.findMany({
      where: { isActive: true, stock: { lte: 5 } },
      select: { nameUz: true, stock: true },
      orderBy: { stock: 'asc' },
      take: 10,
    });

    // Overdue debts
    const overdueDebts = await prisma.debt.findMany({
      where: { isPaid: false, dueDate: { lt: new Date() } },
      select: { personName: true, amount: true, paidAmount: true, dueDate: true },
    });

    // Unpaid debts summary
    const allDebts = await prisma.debt.findMany({
      where: { isPaid: false },
      select: { type: true, amount: true, paidAmount: true },
    });

    const theyOweUs = allDebts.filter(d => d.type === 'WHO_OWES_US').reduce((s, d) => s + (d.amount - d.paidAmount), 0);
    const weOwe = allDebts.filter(d => d.type === 'WE_OWE').reduce((s, d) => s + (d.amount - d.paidAmount), 0);

    const fmt = (n: number) => n.toLocaleString('ru-RU');

    // Build message
    let message = `📊 <b>Microgreen — Kunlik hisobot</b>\n`;
    message += `📅 ${new Date().toLocaleDateString('uz-UZ', { day: '2-digit', month: 'long', year: 'numeric' })}\n\n`;

    // Revenue
    message += `💰 <b>Bugungi savdo:</b>\n`;
    message += `   Online: ${fmt(onlineRevenue)} so'm (${summary.orders} ta)\n`;
    message += `   Do'kon: ${fmt(posRevenue)} so'm (${summary.posSales} ta)\n`;
    if (returnAmount > 0) {
      message += `   Qaytarish: -${fmt(returnAmount)} so'm (${summary.returnCount} ta)\n`;
    }
    message += `   <b>Jami: ${fmt(totalRevenue)} so'm</b>\n\n`;

    // Profit
    message += `📈 <b>Foyda:</b>\n`;
    message += `   Tan narxi: ${fmt(totalCost)} so'm\n`;
    message += `   <b>Sof foyda: ${fmt(netProfit)} so'm</b> (${margin.toFixed(0)}% marja)\n\n`;

    // Посадки: что созрело и что просрочено.
    //
    // Напоминаний о посадках не было ни одного — фазу партии умел считать
    // только экран в браузере, поэтому партия успевала протухнуть молча.
    // raiseGrowAlerts заодно кладёт сигнал в колокольчик админки, чтобы он
    // дождался владельца, а не исчезал вместе с закрытой вкладкой.
    const growState = await scanGrowBatches();
    message += growReportLines(growState);
    await raiseGrowAlerts(growState).catch((err) =>
      console.error('Grow alerts failed (report still sent):', err),
    );

    // Просрочка по дебиторке уходит в это же сообщение ниже, но сообщение
    // пролистывается, а сигнал в колокольчике дожидается владельца — та же
    // причина, по которой рядом стоит raiseGrowAlerts.
    await alertOverdueDebts().catch((err) =>
      console.error('Debt alerts failed (report still sent):', err),
    );

    // Выпадение клиента из ритма нигде больше не всплывает: в списках он
    // остаётся активным, а заказы просто перестают приходить.
    await alertDropouts().catch((err) =>
      console.error('Dropout alerts failed (report still sent):', err),
    );

    // Коридоры нормы: само число в отчёте ничего не говорит, пока не
    // задана граница, за которой пора что-то делать.
    await alertKpiBreaches().catch((err) =>
      console.error('KPI alerts failed (report still sent):', err),
    );

    // Critical stock
    if (criticalProducts.length > 0) {
      message += `⚠️ <b>Kam qolgan tovarlar (${criticalProducts.length}):</b>\n`;
      for (const p of criticalProducts) {
        message += `   ${p.stock <= 2 ? '🔴' : '🟡'} ${p.nameUz} — ${p.stock} dona\n`;
      }
      message += '\n';
    }

    // Overdue debts
    if (overdueDebts.length > 0) {
      message += `🔴 <b>Muddati o'tgan qarzlar (${overdueDebts.length}):</b>\n`;
      for (const d of overdueDebts) {
        const remaining = d.amount - d.paidAmount;
        const days = Math.floor((Date.now() - new Date(d.dueDate!).getTime()) / 86400000);
        message += `   ${d.personName} — ${fmt(remaining)} so'm (${days} kun kechikmoqda)\n`;
      }
      message += '\n';
    }

    // Debt balance
    message += `💳 <b>Qarzlar balansi:</b>\n`;
    message += `   Bizga qarzdor: ${fmt(theyOweUs)} so'm\n`;
    message += `   Biz qarzdormiz: ${fmt(weOwe)} so'm\n`;

    // Send to Telegram
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: adminChatId,
        text: message,
        parse_mode: 'HTML',
        // Дневной отчёт — это разговор про деньги, и «Сводка» теперь и
        // есть разговор про деньги: сутки сверху, неделя и месяц ниже.
        // Прежний адрес `revenue` остался живым для старых сообщений, но
        // новые ссылки ведут на пункт, который есть в меню.
        reply_markup: openKeyboard(adminChatId, 'stats', null, '💵 Доход за день'),
        disable_web_page_preview: true,
      }),
    });

    return NextResponse.json({ success: true, message: 'Daily report sent' });
  } catch (error) {
    console.error('Daily report error:', error);
    return NextResponse.json({ error: 'Failed to send report' }, { status: 500 });
  }
}

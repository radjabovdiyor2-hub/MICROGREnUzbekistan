import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';

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

    // Today's online orders
    const todayOrders = await prisma.order.findMany({
      where: { createdAt: { gte: today, lte: endOfDay }, status: { not: 'CANCELLED' } },
      select: { total: true },
    });

    // Today's POS sales (include costPrice for profit calc)
    const todayPOS = await prisma.stockMovement.findMany({
      where: {
        type: 'OUT',
        reason: { startsWith: "Do'kon sotish" },
        createdAt: { gte: today, lte: endOfDay },
      },
      include: { product: { select: { price: true, costPrice: true } } },
    });

    // Today's returns
    const todayReturns = await prisma.stockMovement.findMany({
      where: {
        type: 'IN',
        reason: { startsWith: 'Qaytarish' },
        createdAt: { gte: today, lte: endOfDay },
      },
      include: { product: { select: { price: true } } },
    });

    const onlineRevenue = todayOrders.reduce((s, o) => s + o.total, 0);
    const posGrossRevenue = todayPOS.reduce((s, m) => s + Math.abs(m.quantity) * (m.salePrice || m.product.price), 0);
    const returnAmount = todayReturns.reduce((s, m) => s + Math.abs(m.quantity) * (m.salePrice || m.product.price), 0);
    const posRevenue = posGrossRevenue - returnAmount;
    const totalRevenue = onlineRevenue + posRevenue;

    // Build cost price map from IN movements + product costPrice
    const costMap = new Map<string, number>();
    const inMovements = await prisma.stockMovement.findMany({
      where: { type: 'IN', costPrice: { not: null } },
      select: { productId: true, costPrice: true },
      orderBy: { createdAt: 'desc' },
    });
    for (const m of inMovements) {
      if (!costMap.has(m.productId) && m.costPrice) {
        costMap.set(m.productId, m.costPrice);
      }
    }
    const productCosts = await prisma.product.findMany({
      where: { costPrice: { not: null } },
      select: { id: true, costPrice: true },
    });
    for (const p of productCosts) {
      if (!costMap.has(p.id) && p.costPrice) {
        costMap.set(p.id, p.costPrice);
      }
    }

    // Calculate total cost
    let totalCost = 0;
    for (const m of todayPOS) {
      const qty = Math.abs(m.quantity);
      const cp = m.costPrice || costMap.get(m.productId) || m.product.costPrice || 0;
      totalCost += qty * cp;
    }

    const netProfit = totalRevenue - totalCost;
    const margin = totalRevenue > 0 ? (netProfit / totalRevenue * 100) : 0;

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
    message += `   Online: ${fmt(onlineRevenue)} so'm (${todayOrders.length} ta)\n`;
    message += `   Do'kon: ${fmt(posRevenue)} so'm (${todayPOS.length} ta)\n`;
    if (returnAmount > 0) {
      message += `   Qaytarish: -${fmt(returnAmount)} so'm (${todayReturns.length} ta)\n`;
    }
    message += `   <b>Jami: ${fmt(totalRevenue)} so'm</b>\n\n`;

    // Profit
    message += `📈 <b>Foyda:</b>\n`;
    message += `   Tan narxi: ${fmt(totalCost)} so'm\n`;
    message += `   <b>Sof foyda: ${fmt(netProfit)} so'm</b> (${margin.toFixed(0)}% marja)\n\n`;

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
      body: JSON.stringify({ chat_id: adminChatId, text: message, parse_mode: 'HTML' }),
    });

    return NextResponse.json({ success: true, message: 'Daily report sent' });
  } catch (error) {
    console.error('Daily report error:', error);
    return NextResponse.json({ error: 'Failed to send report' }, { status: 500 });
  }
}

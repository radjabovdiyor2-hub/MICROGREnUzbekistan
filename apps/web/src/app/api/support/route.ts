import { NextRequest, NextResponse } from 'next/server';
import { notifyOfficeSupport } from '@/lib/office';
import { notifyAdmin } from '@/lib/notify';
import { consume, clientIp, tooManyRequests } from '@/lib/rateLimit';

// ==========================================
// Customer support / complaint from the site -> AI-office support.
// The office raises an urgent PM task (pm_on_complaint) and Stepan is notified.
// ==========================================
export async function POST(request: NextRequest) {
  // Каждое обращение доходит до владельца в Telegram и заводит срочную
  // задачу в CRM — без лимита это флуд чата и очереди задач.
  const limit = await consume(`support:${clientIp(request)}`, 5, 60 * 60 * 1000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  try {
    const { name, phone, telegramId, message } = await request.json();
    if (!message || String(message).trim().length < 3) {
      return NextResponse.json({ error: 'message required' }, { status: 400 });
    }

    await notifyOfficeSupport({ name, phone, telegramId, message: String(message).trim() });
    await notifyAdmin({ type: 'info', message: `🆘 Обращение с сайта${name ? ` от ${name}` : ''}${phone ? ` (${phone})` : ''}:\n${message}` });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Support submit error:', error);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}

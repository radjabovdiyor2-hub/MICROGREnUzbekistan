import { NextRequest, NextResponse } from 'next/server';

// POST — Post to Telegram channel
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, title, description } = body;

    if (!title) {
      return NextResponse.json({ error: 'title required' }, { status: 400 });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const channelId = process.env.CHANNEL_ID;

    if (!token || !channelId) {
      return NextResponse.json(
        { error: 'TELEGRAM_BOT_TOKEN or CHANNEL_ID not configured' },
        { status: 500 },
      );
    }

    // Format message based on type
    let emoji = '📢';
    if (type === 'promo') emoji = '🎉';
    else if (type === 'update') emoji = '🔔';
    else if (type === 'news') emoji = '📰';

    const text = `${emoji} <b>${title}</b>\n\n${description || ''}`;

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channelId,
        text,
        parse_mode: 'HTML',
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[Channel Post] Telegram API error:', err);
      return NextResponse.json({ error: 'Telegram API error' }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Channel Post] Error:', error);
    return NextResponse.json({ error: 'Failed to post' }, { status: 500 });
  }
}

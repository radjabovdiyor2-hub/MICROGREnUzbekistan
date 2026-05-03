import { NextRequest, NextResponse } from 'next/server';
import { notifyAdmin } from '@/lib/notify';

// POST — send admin notification via Telegram
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, message } = body;

    if (!message) {
      return NextResponse.json({ error: 'message required' }, { status: 400 });
    }

    const sent = await notifyAdmin({ type: type || 'info', message });
    return NextResponse.json({ success: true, sent });
  } catch (error) {
    console.error('[Notify] Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

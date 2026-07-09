import { NextRequest, NextResponse } from 'next/server';

// POST — Receive ecosystem events from the bot
// Real event processing happens in TGAS; this endpoint just acknowledges receipt.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, payload, source } = body;

    if (!type) {
      return NextResponse.json({ error: 'type required' }, { status: 400 });
    }

    console.log(`[Ecosystem Event] type=${type} source=${source || 'unknown'}`, payload);

    return NextResponse.json({ received: true, type });
  } catch (error) {
    console.error('[Ecosystem Event] Error:', error);
    return NextResponse.json({ error: 'Failed to process event' }, { status: 500 });
  }
}

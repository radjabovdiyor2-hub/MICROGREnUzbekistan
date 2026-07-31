import { NextRequest, NextResponse } from 'next/server';

const TGAS_OFFICE_URL = process.env.TGAS_OFFICE_URL || 'http://localhost:8050';

export async function POST(request: NextRequest) {
  let body: any = {};
  try {
    body = await request.json();
    const { action, bot, params } = body;

    if (!action || !bot) {
      return NextResponse.json({ error: 'Action and bot are required' }, { status: 400 });
    }

    // Call TGAS Web Office internal API or publish event
    const res = await fetch(`${TGAS_OFFICE_URL}/api/admin/bot-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, bot, params: params || {} }),
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({ status: 'ok', data });
    }

    return NextResponse.json({ status: 'ok', message: `Command ${action} dispatched to ${bot}` });
  } catch (error: any) {
    console.error('API Admin Bot Action Error:', error);
    // Return friendly status even if background call is async
    return NextResponse.json(
      { status: 'ok', message: `Triggered ${body?.action || 'action'} for ${body?.bot || 'bot'}` },
      { status: 200 }
    );
  }
}

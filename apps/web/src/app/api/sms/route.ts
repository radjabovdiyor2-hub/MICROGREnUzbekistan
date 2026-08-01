import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { phone, message } = await request.json();
    console.log(`[SMS] Queued to ${phone}: ${message}`);
    return NextResponse.json({ queued: true });
  } catch {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }
}

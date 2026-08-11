import { NextRequest, NextResponse } from 'next/server';
import { requireBotAuth } from '@/lib/botAuth';
import { unauthorized } from '@/lib/adminAuth';

// ══════════════════════════════════════════════════════════════════════
// POST — Receive ecosystem events from the bot
// Real event processing happens in TGAS; this endpoint just acknowledges receipt.
//
// Вызывающий один — витринный бот (apps/bot, ecosystem_bridge), и он ходит
// с общим секретом. Проверки не было, а тело запроса уходило в лог целиком:
// открытая дверь, которой можно набить журнал чем угодно и с любой скоростью.
// ══════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  if (!requireBotAuth(request)) return unauthorized();

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

import { NextRequest, NextResponse } from 'next/server';
import { requireBotAuth } from '@/lib/botAuth';
import { recordAiUsage } from '@/lib/ai/usage';

// ==========================================
// Приём расхода на ИИ от витринного бота.
//
// Бот зовёт модель напрямую (разбор фото, расшифровка голоса) и в базу
// ходить не может — модулям запрещены прямые импорты друг друга. Офис пишет
// расход сам через `persist_fn`, а у бота такого крючка не было вовсе:
// `bot_name="storefront_bot"` передавался, но записывать было некому, и
// траты витринного бота не попадали в «Расходы на ИИ» ни одной строкой.
//
// Дверь закрыта тем же секретом, что и остальные вызовы бота.
// ==========================================

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!requireBotAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const bot = String(body.bot || '').trim();
    const model = String(body.model || '').trim();

    if (!bot || !model) {
      return NextResponse.json({ error: 'bot and model required' }, { status: 400 });
    }

    await recordAiUsage({
      bot,
      model,
      inputTokens: Number(body.inputTokens) || 0,
      outputTokens: Number(body.outputTokens) || 0,
      provider: body.provider ? String(body.provider) : undefined,
    });

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('AI usage ingest error:', error);
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}

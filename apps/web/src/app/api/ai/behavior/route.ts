import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { requireBotAuth } from '@/lib/botAuth';
import { isAuthorized } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

// ══════════════════════════════════════════════════════════════════════
// Директивы поведения ботов из петли обучения (`bot_learnings`).
//
// Дверь закрыта ДВАЖДЫ и намеренно. Правило в middleware (`/api/ai/behavior`
// → ADMIN, бот проходит по общему секрету) — первый рубеж; проверка здесь —
// второй, потому что matcher middleware исключает часть путей, и обращение
// мимо него прошло бы без единой проверки. Ровно так этот роут и жил:
// не покрыт RULES, не звал ни один auth-примитив и отдавал анониму
// внутренние указания, по которым бот разговаривает с клиентом.
//
// `requireBotAuth` принимает и `Bearer`, и `x-bot-secret` — витринный бот
// ходит первым способом; `isAuthorized` добавляет сессию владельца, чтобы
// админка могла показать те же директивы человеку.
// ══════════════════════════════════════════════════════════════════════

export async function GET(request: Request) {
  if (!requireBotAuth(request) && !isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const bot = searchParams.get('bot') || 'sales_bot';
    const metric = searchParams.get('metric') || 'conversion';

    const behavior = await prisma.botLearning.findFirst({
      where: {
        bot,
        metric,
        isActive: true,
      },
      orderBy: {
        id: 'desc',
      },
    });

    if (!behavior || !behavior.adjustment) {
      return NextResponse.json({ directive: null });
    }

    // Extract the textual directives from the JSON adjustment
    const adj = behavior.adjustment as Record<string, unknown>;
    const directives = Object.values(adj).filter(v => typeof v === 'string').join(' ');

    return NextResponse.json({ directive: directives || null });
  } catch (error) {
    console.error('Failed to fetch AI behavior:', error);
    return NextResponse.json({ directive: null }, { status: 500 });
  }
}

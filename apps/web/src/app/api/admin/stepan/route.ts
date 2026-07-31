import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';
import { consume, clientIp, tooManyRequests } from '@/lib/rateLimit';
import { think, aiAvailable, type ChatMessage } from '@/lib/stepan/brain';

// ══════════════════════════════════════════════════════════════════════
// Стёпан в админке — диалог с доступом к данным компании.
//
// Тот же Стёпан, что и в Telegram: одна база, одна шина. Задача,
// поставленная здесь, видна боту в Telegram, и наоборот.
//
// Действия, меняющие данные, здесь НЕ выполняются — только готовятся.
// Их подтверждает владелец в /api/admin/stepan/execute.
// ══════════════════════════════════════════════════════════════════════

export const maxDuration = 120;

/** Каждый вызов стоит денег: цикл рассуждения — это несколько запросов к модели. */
const RATE = { limit: 20, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const ip = clientIp(request);
  const limit = await consume(`stepan:${ip}`, RATE.limit, RATE.windowMs);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  if (!aiAvailable()) {
    return NextResponse.json(
      { error: 'ИИ не настроен: задайте OPENAI_API_KEY или GEMINI_API_KEY' },
      { status: 503 },
    );
  }

  let body: { messages?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: 'Нужен непустой messages' }, { status: 400 });
  }

  // Держим короткий хвост истории: длинная переписка удорожает каждый
  // следующий вопрос, а Стёпану для решения нужен свежий контекст.
  const messages: ChatMessage[] = body.messages
    .slice(-12)
    .filter((m: unknown): m is ChatMessage => {
      if (typeof m !== 'object' || m === null) return false;
      const msg = m as ChatMessage;
      return (msg.role === 'user' || msg.role === 'assistant') && typeof msg.content === 'string';
    })
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));

  if (!messages.length) {
    return NextResponse.json({ error: 'Сообщения не распознаны' }, { status: 400 });
  }

  try {
    const result = await think(messages);

    audit({
      action: 'stepan.chat',
      actor: 'owner',
      role: 'ADMIN',
      ip,
      target: messages[messages.length - 1].content.slice(0, 120),
      meta: { tools: result.usedTools, proposals: result.proposals.length },
    });

    return NextResponse.json({
      status: 'ok',
      reply: result.reply,
      proposals: result.proposals,
      usedTools: result.usedTools,
    });
  } catch (error) {
    console.error('[stepan] цикл рассуждения упал:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Стёпан не смог ответить' },
      { status: 502 },
    );
  }
}

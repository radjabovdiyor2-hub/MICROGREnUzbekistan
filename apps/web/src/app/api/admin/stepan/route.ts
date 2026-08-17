import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';
import { consume, clientIp, tooManyRequests } from '@/lib/rateLimit';
import { think, aiAvailable, type ChatMessage } from '@/lib/stepan/brain';
import { loadRecentMessages, appendMessage } from '@/lib/stepan/memory';

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
      { error: 'ИИ не настроен: задайте OPENAI_API_KEY' },
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

  // Из тела берём только сам вопрос. Контекст — из общей памяти, чтобы
  // разговор продолжался при смене канала и переживал перезагрузку.
  const incoming = body.messages
    .filter((m: unknown): m is ChatMessage => {
      if (typeof m !== 'object' || m === null) return false;
      const msg = m as ChatMessage;
      return (msg.role === 'user' || msg.role === 'assistant') && typeof msg.content === 'string';
    })
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));

  const question = [...incoming].reverse().find(m => m.role === 'user');
  if (!question) {
    return NextResponse.json({ error: 'Сообщения не распознаны' }, { status: 400 });
  }

  // Недоступность памяти — не повод отказать в ответе, но и не повод
  // молча ответить без контекста: владелец должен узнать об этом сам.
  let history: ChatMessage[] = [];
  let memoryWarning: string | null = null;
  try {
    history = (await loadRecentMessages()).map(m => ({ role: m.role, content: m.content }));
    await appendMessage({ role: 'user', content: question.content, channel: 'web' });
  } catch (error) {
    console.error('[stepan] память недоступна:', error);
    memoryWarning = 'Отвечаю без памяти: хранилище разговора недоступно, прошлый контекст не учтён.';
  }

  const messages: ChatMessage[] = [...history, question];

  try {
    const result = await think(messages);

    if (!memoryWarning) {
      try {
        await appendMessage({
          role: 'assistant',
          content: result.reply,
          channel: 'web',
          toolCalls: result.usedTools,
        });
      } catch (error) {
        console.error('[stepan] ответ не сохранён в память:', error);
        memoryWarning = 'Ответ не сохранён в память — следующий вопрос его не увидит.';
      }
    }

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
      memoryWarning,
    });
  } catch (error) {
    console.error('[stepan] цикл рассуждения упал:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Стёпан не смог ответить' },
      { status: 502 },
    );
  }
}

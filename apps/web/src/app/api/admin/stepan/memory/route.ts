import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { loadRecentMessages, appendMessage, startNewConversation } from '@/lib/stepan/memory';

// ══════════════════════════════════════════════════════════════════════
// Общая память ассистента — доступ снаружи витрины.
//
// Двое потребителей:
//   · админка — рисует историю разговора при открытии страницы;
//   · Стёпан в Telegram (apps/tgas) — читает контекст и дописывает реплики.
//
// Прямой доступ из apps/tgas в эту таблицу запрещён конституцией: связь
// между модулями только через HTTP. Бот авторизуется тем же BOT_SECRET,
// которым уже пользуется для журнальных кронов, — isAuthorized принимает
// его для server-to-server.
// ══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const messages = await loadRecentMessages();
    return NextResponse.json({ status: 'ok', messages });
  } catch (error) {
    console.error('[stepan/memory] чтение не удалось:', error);
    return NextResponse.json(
      { status: 'error', error: 'Хранилище разговора недоступно' },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  let body: { role?: unknown; content?: unknown; channel?: unknown; toolCalls?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: 'error', error: 'Некорректный JSON' }, { status: 400 });
  }

  const role = body.role === 'assistant' ? 'assistant' : body.role === 'user' ? 'user' : null;
  const channel = body.channel === 'telegram' ? 'telegram' : body.channel === 'web' ? 'web' : null;
  const content = typeof body.content === 'string' ? body.content.trim() : '';

  if (!role || !channel || !content) {
    return NextResponse.json(
      { status: 'error', error: 'Нужны role (user|assistant), channel (web|telegram) и непустой content' },
      { status: 400 },
    );
  }

  try {
    await appendMessage({
      role,
      channel,
      content: content.slice(0, 8000),
      toolCalls: body.toolCalls,
    });
    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('[stepan/memory] запись не удалась:', error);
    return NextResponse.json(
      { status: 'error', error: 'Хранилище разговора недоступно' },
      { status: 503 },
    );
  }
}

/** Закрыть текущую нить: владелец начинает новую тему. Прошлая сохраняется. */
export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    await startNewConversation();
    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('[stepan/memory] не удалось закрыть нить:', error);
    return NextResponse.json(
      { status: 'error', error: 'Хранилище разговора недоступно' },
      { status: 503 },
    );
  }
}

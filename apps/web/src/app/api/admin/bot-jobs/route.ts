import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';
import { officeFetch } from '@/lib/office/client';

// ══════════════════════════════════════════════════════════════════════
// Расписания фоновых задач ботов.
//
// Все 45 задач были вписаны часами и минутами прямо в bots/*/main.py:
// перенести вечерний отчёт на час позже означало правку Python и передеплой.
// Теперь список и время правятся отсюда, а боты перечитывают их по
// событию config_updated — без перезапуска контейнеров.
// ══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const res = await officeFetch<{ jobs: unknown[] }>('/api/admin/bot-jobs');
  if (!res.ok) {
    return NextResponse.json({ status: 'error', error: res.error, jobs: [] }, { status: 503 });
  }
  return NextResponse.json({ status: 'ok', ...res.data });
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: 'error', error: 'Некорректный JSON' }, { status: 400 });
  }

  const res = await officeFetch<{ bot: string; name: string }>('/api/admin/bot-jobs', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return NextResponse.json(
      { status: 'error', error: res.error },
      { status: res.status === 504 ? 504 : 400 },
    );
  }

  audit({
    action: 'bot.schedule.update',
    actor: 'owner',
    role: 'ADMIN',
    ip: request.headers.get('x-forwarded-for') ?? undefined,
    target: `${body.bot}:${body.name}`,
    meta: body,
  });

  return NextResponse.json({ status: 'ok', ...res.data });
}

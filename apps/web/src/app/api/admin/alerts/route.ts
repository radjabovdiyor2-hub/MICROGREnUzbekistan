import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';

// ══════════════════════════════════════════════════════════════════════
// Сигналы владельцу от ИИ-офиса.
//
// У Стёпана дюжина расписаний: здоровье ботов каждые пять минут,
// KPI-watchdog, бекап, дедлайны. Всё это уходило только в Telegram —
// работая в админке, владелец о проблеме не узнавал.
//
// POST зовёт офис, авторизуясь BOT_SECRET (middleware пропускает его на
// /api/admin для server-to-server). GET и PATCH — админка.
//
// Отказ хранилища отдаём как отказ: пустой список вместо ошибки — это
// «всё спокойно» на экране в тот момент, когда на самом деле неизвестно.
// ══════════════════════════════════════════════════════════════════════

const MAX_LIMIT = 50;

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const includeRead = request.nextUrl.searchParams.get('all') === '1';

  try {
    const alerts = await prisma.ownerAlert.findMany({
      where: includeRead ? {} : { readAt: null },
      orderBy: { id: 'desc' },
      take: MAX_LIMIT,
    });

    return NextResponse.json({
      status: 'ok',
      alerts: alerts.map(a => ({
        id: String(a.id),
        kind: a.kind,
        severity: a.severity,
        title: a.title,
        message: a.message,
        source: a.source,
        suggestedAction: a.suggestedAction,
        createdAt: a.createdAt,
        readAt: a.readAt,
      })),
    });
  } catch (error) {
    console.error('[alerts] чтение не удалось:', error);
    return NextResponse.json(
      { status: 'error', error: 'Хранилище сигналов недоступно', alerts: [] },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  let body: {
    kind?: unknown;
    severity?: unknown;
    title?: unknown;
    message?: unknown;
    source?: unknown;
    suggestedAction?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: 'error', error: 'Некорректный JSON' }, { status: 400 });
  }

  const kind = typeof body.kind === 'string' ? body.kind.trim().slice(0, 48) : '';
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 255) : '';
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 4000) : '';
  const source = typeof body.source === 'string' ? body.source.trim().slice(0, 48) : '';
  const severity =
    body.severity === 'critical' || body.severity === 'info' ? body.severity : 'warning';

  if (!kind || !title || !message || !source) {
    return NextResponse.json(
      { status: 'error', error: 'Нужны kind, title, message и source' },
      { status: 400 },
    );
  }

  try {
    await prisma.ownerAlert.create({
      data: {
        kind,
        severity,
        title,
        message,
        source,
        suggestedAction: (body.suggestedAction ?? undefined) as never,
      },
    });
    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('[alerts] запись не удалась:', error);
    return NextResponse.json(
      { status: 'error', error: 'Хранилище сигналов недоступно' },
      { status: 503 },
    );
  }
}

/** Пометить прочитанным: одиночный id или все сразу. */
export async function PATCH(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  let body: { id?: unknown; all?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: 'error', error: 'Некорректный JSON' }, { status: 400 });
  }

  try {
    if (body.all === true) {
      await prisma.ownerAlert.updateMany({ where: { readAt: null }, data: { readAt: new Date() } });
      return NextResponse.json({ status: 'ok' });
    }

    if (typeof body.id !== 'string' && typeof body.id !== 'number') {
      return NextResponse.json({ status: 'error', error: 'Нужен id или all: true' }, { status: 400 });
    }

    await prisma.ownerAlert.update({
      where: { id: BigInt(body.id) },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('[alerts] отметка о прочтении не удалась:', error);
    return NextResponse.json(
      { status: 'error', error: 'Хранилище сигналов недоступно' },
      { status: 503 },
    );
  }
}

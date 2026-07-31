import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';
import { safeError } from '@/lib/safeError';

// ══════════════════════════════════════════════════════════════════════
// Выводы петель обучения ботов.
//
// Раньше только чтение. Проблема: adjustment — это параметры поведения,
// которые ИИ придумал сам и которые боты применяют (sales_bot читает их
// перед каждым диалогом). Если модель сделала вредный вывод, отменить его
// можно было единственным способом — UPDATE в базе руками.
//
// Теперь владелец отключает и правит выводы из админки. Это и есть
// «человек в контуре» для самообучающейся системы.
// ══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const { searchParams } = new URL(request.url);
  // По умолчанию — только активные (так было раньше). ?all=1 показывает
  // и отключённые, чтобы вывод можно было вернуть в строй.
  const showAll = searchParams.get('all') === '1';
  const bot = searchParams.get('bot')?.trim();

  try {
    const learnings = await prisma.botLearning.findMany({
      where: {
        ...(showAll ? {} : { isActive: true }),
        ...(bot ? { bot } : {}),
      },
      orderBy: { appliedAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({
      status: 'ok',
      learnings: learnings.map((l) => ({
        id: l.id,
        bot: l.bot,
        metric: l.metric,
        observation: l.observation,
        inference: l.inference,
        adjustment: l.adjustment,
        isActive: l.isActive,
        appliedAt: l.appliedAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    console.error('API Admin Learnings GET Error:', error);
    return NextResponse.json(
      { error: safeError(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
  }

  const id = Number(body.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Нужен числовой id' }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if ('isActive' in body) data.isActive = !!body.isActive;

  if ('adjustment' in body) {
    // Значение уходит прямиком в поведение бота — пускаем только объект.
    // Строка или массив здесь ломают get_active_behavior() на стороне Python.
    let parsed = body.adjustment;
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        return NextResponse.json({ error: 'adjustment: некорректный JSON' }, { status: 400 });
      }
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return NextResponse.json(
        { error: 'adjustment должен быть JSON-объектом' },
        { status: 400 },
      );
    }
    data.adjustment = parsed;
  }

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: 'Нечего менять' }, { status: 400 });
  }

  try {
    const updated = await prisma.botLearning.update({ where: { id }, data });

    audit({
      action: 'learning.update',
      actor: 'owner',
      role: 'ADMIN',
      ip: request.headers.get('x-forwarded-for') ?? undefined,
      target: `${updated.bot}:${updated.metric}#${id}`,
      meta: data,
    });

    return NextResponse.json({ status: 'ok', learning: updated });
  } catch (error) {
    console.error('API Admin Learnings PATCH Error:', error);
    return NextResponse.json({ error: 'Вывод не найден' }, { status: 404 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Нужен числовой id' }, { status: 400 });
  }

  try {
    const removed = await prisma.botLearning.delete({ where: { id } });
    audit({
      action: 'learning.delete',
      actor: 'owner',
      role: 'ADMIN',
      ip: request.headers.get('x-forwarded-for') ?? undefined,
      target: `${removed.bot}:${removed.metric}#${id}`,
    });
    return NextResponse.json({ status: 'ok' });
  } catch {
    return NextResponse.json({ error: 'Вывод не найден' }, { status: 404 });
  }
}

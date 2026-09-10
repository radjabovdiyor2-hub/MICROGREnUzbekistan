import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@repo/database';
import { requireBotAuth } from '@/lib/botAuth';
import { audit } from '@/lib/audit';
import { localDayRange } from '@/lib/localDate';
import { publish } from '@/lib/realtime/bus';
import { safeError } from '@/lib/safeError';

// ══════════════════════════════════════════════════════════════════════
// «Приступить» по рейсу доставки.
//
// Устроено так же, как подтверждение объезда, и по тем же доводам: чей это
// рейс — решает СЕРВЕР по `telegramId`, а номер из кнопки проверяется на
// принадлежность, потому что кнопку можно переслать другому человеку.
//
// ВОДИТЕЛЬ ОПОЗНАЁТСЯ ПО ИДЕНТИФИКАТОРУ. `Employee.name` не уникально, и
// сверка по имени дала бы одному Азизу подтвердить рейс другого — ровно
// тот дефект, который чинился в выборке рейсов.
// ══════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    if (!requireBotAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const raw = body?.telegramId;
    const text = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '';
    if (!/^\d{1,19}$/.test(text)) {
      return NextResponse.json({ error: 'Не указан telegramId' }, { status: 400 });
    }

    const employee = await prisma.employee.findUnique({
      where: { telegramId: BigInt(text) },
      select: { id: true, name: true, isActive: true },
    });
    if (!employee || !employee.isActive) {
      return NextResponse.json({ error: 'Сотрудник не найден' }, { status: 403 });
    }

    const routeId = typeof body?.routeId === 'string' ? body.routeId : '';
    const { start } = localDayRange();

    const route = await prisma.deliveryRoute.findFirst({
      where: {
        driverId: employee.id,
        ...(routeId
          ? { id: routeId }
          : // Без номера берём сегодняшний незакрытый: так работает кнопка
            // в меню, где рейса под рукой нет.
            { date: start, status: { not: 'completed' } }),
      },
      select: { id: true, acceptedAt: true, _count: { select: { stops: true } } },
      orderBy: { createdAt: 'desc' },
    });

    if (!route) {
      return NextResponse.json({ error: 'Рейс не найден' }, { status: 404 });
    }

    // Повторное нажатие — не ошибка: сообщение остаётся в чате.
    if (route.acceptedAt !== null) {
      return NextResponse.json({
        status: 'ok',
        already: true,
        stops: route._count.stops,
        acceptedAt: route.acceptedAt,
      });
    }

    const acceptedAt = new Date();
    await prisma.deliveryRoute.update({ where: { id: route.id }, data: { acceptedAt } });

    audit({
      action: 'delivery.route.accept',
      actor: employee.name,
      role: 'SELLER',
      target: route.id,
    });
    publish('orders');

    return NextResponse.json({
      status: 'ok',
      already: false,
      stops: route._count.stops,
      acceptedAt,
    });
  } catch (error: unknown) {
    console.error('API Admin Deliveries Accept POST Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

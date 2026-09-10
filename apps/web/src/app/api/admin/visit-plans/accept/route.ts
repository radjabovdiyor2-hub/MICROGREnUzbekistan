import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@repo/database';
import { requireBotAuth } from '@/lib/botAuth';
import { audit } from '@/lib/audit';
import { localDayRange } from '@/lib/localDate';
import { publish } from '@/lib/realtime/bus';
import { safeError } from '@/lib/safeError';

// ══════════════════════════════════════════════════════════════════════
// «Приступить»: сотрудник подтвердил, что увидел объезд.
//
// ЧЕГО НЕ БЫЛО. Кнопка «Взять в работу» жила только в PWA и работала на
// клиенте: подмешивала точки в localStorage телефона. На сервер не уходило
// ничего, и владелец видел «0 из 8» одинаково в двух совершенно разных
// случаях — человек не открывал задание вовсе и человек стоит в пробке у
// первой точки. Это два разных дня и два разных разговора.
//
// ЭТО ПОДТВЕРЖДЕНИЕ, А НЕ ШЛАГБАУМ — решение владельца. Не нажал — объезд
// всё равно его, отметки визитов засчитываются, ехать можно. Связь в поле
// пропадает, а работа не ждёт.
//
// ЧЕЙ ПЛАН — РЕШАЕТ СЕРВЕР. Бот присылает только `telegramId`; какой план
// принадлежит этому человеку, находим сами. Телу запроса верить нельзя в
// вопросе «чьё это» — тот же принцип, что у стоянок и у расстояния до
// клиента.
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
      select: { name: true, isActive: true },
    });
    if (!employee || !employee.isActive) {
      return NextResponse.json({ error: 'Сотрудник не найден' }, { status: 403 });
    }

    // Номер плана из кнопки принимаем, но ПРОВЕРЯЕМ принадлежность: кнопку
    // можно переслать другому человеку, и без проверки чужой объезд
    // подтвердил бы кто угодно из штата.
    const planId = Number(body?.planId);
    const { start } = localDayRange();

    const plan = await prisma.visitPlan.findFirst({
      where: {
        assignee: employee.name,
        ...(Number.isInteger(planId) && planId > 0
          ? { id: planId }
          : // Без номера берём сегодняшний: так работает команда в боте,
            // где кнопки под рукой нет.
            { planDate: start }),
      },
      select: { id: true, acceptedAt: true, planDate: true, stops: { select: { id: true } } },
    });

    if (!plan) {
      return NextResponse.json({ error: 'Объезд не найден' }, { status: 404 });
    }

    // Повторное нажатие — не ошибка: сообщение остаётся в чате, и на
    // кнопку жмут второй раз просто чтобы убедиться.
    if (plan.acceptedAt !== null) {
      return NextResponse.json({
        status: 'ok',
        already: true,
        stops: plan.stops.length,
        acceptedAt: plan.acceptedAt,
      });
    }

    const acceptedAt = new Date();
    await prisma.visitPlan.update({ where: { id: plan.id }, data: { acceptedAt } });

    audit({
      action: 'visit.plan.accept',
      actor: employee.name,
      role: 'SELLER',
      target: `${plan.planDate.toISOString().slice(0, 10)} → ${employee.name}`,
    });

    // Владелец обязан увидеть подтверждение, не перезагружая экран дня.
    publish('customers');

    return NextResponse.json({
      status: 'ok',
      already: false,
      stops: plan.stops.length,
      acceptedAt,
    });
  } catch (error: unknown) {
    console.error('API Admin Visit Plans Accept POST Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

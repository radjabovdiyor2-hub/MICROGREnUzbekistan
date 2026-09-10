import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@repo/database';
import { requireBotAuth } from '@/lib/botAuth';
import { localDayRange } from '@/lib/localDate';
import { safeError } from '@/lib/safeError';

// ══════════════════════════════════════════════════════════════════════
// Кто это и что у него на сегодня.
//
// ЗАЧЕМ. Бот продаж один и тот же для покупателя и для сотрудника, а меню
// им нужно РАЗНОЕ: покупателю каталог и «мои заказы», продавцу — его день.
// Отличить одного от другого может только витрина: связка Telegram ↔
// сотрудник живёт в `Employee.telegramId`, и держать её копию в офисе
// значило бы завести второй список штата, который разойдётся с первым.
//
// ОТВЕЧАЕМ СКУПО. Имя, роль и что назначено на сегодня — ровно то, из чего
// строится меню. Ни телефона, ни PIN, ни зарплаты: дверь открывается общим
// секретом бота, а он лежит у всех одиннадцати процессов офиса.
//
// «НЕ СОТРУДНИК» — ЭТО ОТВЕТ, А НЕ ОШИБКА. Покупателей у бота на порядок
// больше, и 404 на каждом из них засорил бы логи так, что настоящие отказы
// в них потерялись бы.
// ══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    if (!requireBotAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const raw = request.nextUrl.searchParams.get('telegramId') ?? '';
    if (!/^\d{1,19}$/.test(raw)) {
      return NextResponse.json({ error: 'Не указан telegramId' }, { status: 400 });
    }

    const employee = await prisma.employee.findUnique({
      where: { telegramId: BigInt(raw) },
      select: { id: true, name: true, role: true, isActive: true },
    });

    // Уволенный отвечает так же, как посторонний: меню полевой работы ему
    // больше не положено, а разный ответ подсказал бы, что такой человек
    // в системе есть.
    if (!employee || !employee.isActive) {
      return NextResponse.json({ status: 'ok', staff: false });
    }

    const { start } = localDayRange();

    const [plan, route] = await Promise.all([
      prisma.visitPlan.findFirst({
        where: { assignee: employee.name, planDate: start },
        select: {
          id: true,
          acceptedAt: true,
          _count: { select: { stops: true } },
        },
      }),
      prisma.deliveryRoute.findFirst({
        where: { driverId: employee.id, date: start, status: { not: 'completed' } },
        select: { id: true, acceptedAt: true, _count: { select: { stops: true } } },
      }),
    ]);

    return NextResponse.json({
      status: 'ok',
      staff: true,
      employee: { id: employee.id, name: employee.name, role: employee.role },
      // Меню рисуется по тому, ЧТО ЕСТЬ: нет рейса — нет и кнопки «Мой
      // рейс». Кнопка, которая всегда отвечает «ничего нет», учит не
      // нажимать и остальные.
      today: {
        planStops: plan?._count.stops ?? 0,
        planAccepted: plan?.acceptedAt !== null && plan?.acceptedAt !== undefined,
        routeStops: route?._count.stops ?? 0,
        routeAccepted: route?.acceptedAt !== null && route?.acceptedAt !== undefined,
      },
    });
  } catch (error: unknown) {
    console.error('API Admin Staff Me GET Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

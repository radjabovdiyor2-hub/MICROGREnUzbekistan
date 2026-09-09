import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@repo/database';
import { actorOf, getSession } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';
import { formatLocalDate, localDayRange } from '@/lib/localDate';
import { publish } from '@/lib/realtime/bus';
import { safeError } from '@/lib/safeError';

// ══════════════════════════════════════════════════════════════════════
// «Я на точке» и «уехал» — стоянка, подтверждённая человеком.
//
// ЗАЧЕМ ОТДЕЛЬНО ОТ ВЫВОДА ПО ТРЕКУ. Вывод по крошкам слабее: телефон мог
// лежать в машине у соседнего дома, а трансляция могла не включиться
// вовсе. Нажатая кнопка — это утверждение самого сотрудника, и в отчёте
// оно так и помечено (`manual`), а не смешано с догадкой.
//
// К ЭТОЙ ЖЕ СТОЯНКЕ КРЕПИТСЯ ФОТО. Поэтому POST возвращает `stayId`: без
// него фотоотчёту не к чему привязаться, и требование «визит не
// закрывается без фото» было бы невыполнимым.
// ══════════════════════════════════════════════════════════════════════

/**
 * Ключ идемпотентности от телефона. Мусор молча отбрасываем: без ключа
 * отметка всё равно пройдёт, просто без защиты от дублей.
 */
function readRef(raw: unknown): string | null {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(raw) ? raw : null;
}

/**
 * Момент из тела, зажатый в разумное окно.
 *
 * Правило то же, что у отметки визита: неделя назад — предел, будущее не
 * принимаем вовсе. Сбитые часы телефона — обычное дело, а «приехал завтра»
 * ломает порядок дня.
 */
function clampToWindow(raw: unknown): Date {
  const now = Date.now();
  const ms = Number(raw);
  if (!Number.isFinite(ms)) return new Date(now);
  if (ms > now) return new Date(now);
  if (ms < now - 7 * 24 * 60 * 60 * 1000) return new Date(now);
  return new Date(ms);
}

/** Сотрудник запроса — по подписи, а не по телу. */
async function meFrom(request: NextRequest): Promise<{ id: string } | null> {
  const session = getSession(request);
  if (!session || (session.role !== 'ADMIN' && session.role !== 'SELLER')) return null;

  const matches = await prisma.employee.findMany({
    where: { name: session.name ?? '', isActive: true },
    select: { id: true },
    take: 2,
  });
  return matches.length === 1 ? matches[0] : null;
}

/**
 * День сотрудника, создавая его при необходимости.
 *
 * Стоянку можно отметить и без трансляции — тогда дня ещё нет. Отказать в
 * этом случае значит потребовать включённый Telegram ради нажатия кнопки в
 * админке; день заводим с нулевым треком, а границы смены поправит первая
 * же пачка крошек.
 */
async function ensureDay(employeeId: string, at: Date): Promise<number> {
  const { start } = localDayRange(formatLocalDate(at));
  const day = await prisma.fieldDay.upsert({
    where: { employeeId_date: { employeeId, date: start } },
    create: { employeeId, date: start, startedAt: at, source: 'pwa' },
    update: {},
    select: { id: true },
  });
  return day.id;
}

export async function POST(request: NextRequest) {
  try {
    const me = await meFrom(request);
    if (!me) return NextResponse.json({ error: 'Сотрудник не опознан' }, { status: 403 });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const customerId = Number(body?.customerId);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return NextResponse.json({ error: 'Не указан клиент' }, { status: 400 });
    }

    const clientRef = readRef(body?.clientRef);

    // Ключ телефона — первое, что проверяем: очередь повторяет отправку,
    // пока не получит ответа, и без этой проверки один заезд из подвала
    // превратился бы в три.
    if (clientRef) {
      const seen = await prisma.trackStay.findUnique({
        where: { clientRef },
        select: { id: true },
      });
      if (seen) return NextResponse.json({ status: 'ok', stayId: seen.id, reopened: true });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });

    // Момент приезда — из тела: отметка могла пролежать в очереди часы, и
    // `now` приписал бы человеку приезд тогда, когда он уже уехал.
    const arrivedAt = clampToWindow(body?.arrivedAt);
    const fieldDayId = await ensureDay(me.id, arrivedAt);

    // Повторное «я на точке» у того же клиента не плодит стоянку: в поле
    // кнопку нажимают дважды чаще, чем кажется, и второй заезд от
    // случайного двойного нажатия не отличить иначе как по открытости.
    const open = await prisma.trackStay.findFirst({
      where: { fieldDayId, customerId, leftAt: null, confirmedBy: 'manual' },
      select: { id: true, arrivedAt: true },
    });
    if (open) {
      return NextResponse.json({ status: 'ok', stayId: open.id, reopened: true });
    }

    const stay = await prisma.trackStay.create({
      data: { fieldDayId, customerId, arrivedAt, confirmedBy: 'manual', clientRef },
      select: { id: true, arrivedAt: true },
    });

    audit({
      action: 'tracking.stay.in',
      ...actorOf(request),
      ip: request.headers.get('x-forwarded-for') ?? undefined,
      target: `customer#${customerId}`,
    });
    publish('customers');

    return NextResponse.json({ status: 'ok', stayId: stay.id, reopened: false });
  } catch (error: unknown) {
    console.error('API Admin Tracking Stay POST Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

/** «Уехал»: закрывает открытую стоянку и считает длительность. */
export async function PATCH(request: NextRequest) {
  try {
    const me = await meFrom(request);
    if (!me) return NextResponse.json({ error: 'Сотрудник не опознан' }, { status: 403 });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const stayId = Number(body?.stayId);
    const clientRef = readRef(body?.clientRef);

    // Стоянку называют либо номером из базы, либо ключом телефона: из
    // подвала номер неоткуда взять — его выдаёт сервер, до которого в тот
    // момент не достучались.
    const byId = Number.isInteger(stayId) && stayId > 0;
    if (!byId && !clientRef) {
      return NextResponse.json({ error: 'Не указана стоянка' }, { status: 400 });
    }

    // Чужую стоянку закрыть нельзя: проверяем принадлежность дня, а не
    // только существование записи.
    const stay = await prisma.trackStay.findFirst({
      where: {
        ...(byId ? { id: stayId } : { clientRef }),
        fieldDay: { employeeId: me.id },
      },
      select: { id: true, arrivedAt: true, leftAt: true, customerId: true },
    });
    if (!stay) return NextResponse.json({ error: 'Стоянка не найдена' }, { status: 404 });
    if (stay.leftAt) {
      return NextResponse.json({ status: 'ok', stayId: stay.id, alreadyClosed: true });
    }

    // Момент отъезда — тоже из тела: «уехал», пролежавшее в очереди час,
    // иначе приписало бы человеку лишний час на точке.
    const leftAt = clampToWindow(body?.leftAt);
    // Отъезд раньше приезда — сбитые часы. Ноль честнее отрицательного
    // числа, которое в отчёте выглядело бы как ошибка расчёта.
    const dwellSec = Math.max(0, Math.round((leftAt.getTime() - stay.arrivedAt.getTime()) / 1000));

    await prisma.trackStay.update({
      where: { id: stay.id },
      data: { leftAt, dwellSec },
    });

    audit({
      action: 'tracking.stay.out',
      ...actorOf(request),
      ip: request.headers.get('x-forwarded-for') ?? undefined,
      target: `customer#${stay.customerId}`,
      meta: { dwellSec },
    });
    publish('customers');

    return NextResponse.json({ status: 'ok', stayId: stay.id, dwellSec });
  } catch (error: unknown) {
    console.error('API Admin Tracking Stay PATCH Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

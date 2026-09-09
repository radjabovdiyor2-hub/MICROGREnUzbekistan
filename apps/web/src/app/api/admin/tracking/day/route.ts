import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@repo/database';
import { getSession } from '@/lib/adminAuth';
import { formatLocalDate, localDayRange } from '@/lib/localDate';
import { safeError } from '@/lib/safeError';
import { rebuildDay } from '@/lib/tracking/rebuild';
import { fillExpected } from '@/lib/tracking/expected';

// ══════════════════════════════════════════════════════════════════════
// День полевого сотрудника целиком: трек, стоянки, фото, плечи.
//
// КТО ЧЕЙ ДЕНЬ ВИДИТ. Владелец — любой. Продавец — только свой: трек
// коллеги ему знать незачем, а вопрос «где сейчас Азиз» — это вопрос к
// владельцу, а не способ следить друг за другом. Middleware такое различие
// выразить не может (он не знает, чей это день), поэтому рубеж здесь.
//
// ПЕРЕСБОРКА ПРИ ЧТЕНИИ. Стоянки и плечи считаются здесь, а не на каждой
// крошке: проход идемпотентен, а трансляция шлёт точку раз в минуту, и
// гонять по ней геометрию дня — работа впустую.
// ══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session || (session.role !== 'ADMIN' && session.role !== 'SELLER')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const date = sp.get('date') || formatLocalDate();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Дата в формате YYYY-MM-DD' }, { status: 400 });
    }

    const wanted = sp.get('employee');
    let employeeId: string;

    if (session.role === 'ADMIN') {
      if (!wanted) {
        return NextResponse.json({ error: 'Не указан сотрудник' }, { status: 400 });
      }
      employeeId = wanted;
    } else {
      // Продавец: находим его по имени из подписи. Тела запроса здесь не
      // спрашиваем вовсе — иначе чужой день открывался бы подстановкой id.
      const me = await prisma.employee.findMany({
        where: { name: session.name ?? '', isActive: true },
        select: { id: true },
        take: 2,
      });
      if (me.length !== 1) {
        return NextResponse.json({ error: 'Сотрудник не опознан' }, { status: 403 });
      }
      if (wanted && wanted !== me[0].id) {
        return NextResponse.json({ error: 'Доступен только свой день' }, { status: 403 });
      }
      employeeId = me[0].id;
    }

    await rebuildDay(employeeId, date);
    await fillExpected(employeeId, date);

    const { start, end } = localDayRange(date);

    const day = await prisma.fieldDay.findUnique({
      where: { employeeId_date: { employeeId, date: start } },
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        source: true,
        meters: true,
        movingSec: true,
        stops: true,
        employee: { select: { id: true, name: true } },
      },
    });

    if (!day) {
      // Дня нет — это не ошибка: человек мог не включать трансляцию.
      // Пустой ответ честнее 404: экран покажет «трека нет», а не сломается.
      return NextResponse.json({ status: 'ok', day: null, track: [], stays: [], legs: [] });
    }

    const [track, stays, legs] = await Promise.all([
      prisma.trackPing.findMany({
        where: { employeeId, at: { gte: start, lt: end } },
        select: { at: true, latitude: true, longitude: true, accuracyM: true, source: true },
        orderBy: { at: 'asc' },
      }),
      prisma.trackStay.findMany({
        where: { fieldDayId: day.id },
        select: {
          id: true,
          arrivedAt: true,
          leftAt: true,
          dwellSec: true,
          confirmedBy: true,
          customer: {
            select: { id: true, name: true, companyName: true, latitude: true, longitude: true },
          },
          interaction: { select: { id: true, interactionType: true, distanceM: true } },
          photos: { select: { id: true, imageUrl: true, width: true, height: true } },
        },
        orderBy: { arrivedAt: 'asc' },
      }),
      prisma.routeLeg.findMany({
        where: { fieldDayId: day.id },
        select: {
          id: true,
          fromStayId: true,
          toStayId: true,
          departedAt: true,
          arrivedAt: true,
          actualSec: true,
          actualMeters: true,
          expectedSec: true,
          expectedMeters: true,
          provider: true,
          trafficUsed: true,
        },
        orderBy: { departedAt: 'asc' },
      }),
    ]);

    return NextResponse.json({ status: 'ok', day, track, stays, legs });
  } catch (error: unknown) {
    console.error('API Admin Tracking Day GET Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

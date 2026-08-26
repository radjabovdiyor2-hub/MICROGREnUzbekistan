import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { getSession, isAuthorized, isStaff } from '@/lib/adminAuth';

// ══════════════════════════════════════════════════════════════════════
// Маршруты доставки.
//
// КТО ЧТО ВИДИТ. Владелец — все маршруты и всё управление ими. Курьер —
// только свой маршрут и только отметку по точке: собирать рейсы и удалять
// их ему незачем. Разделение внутри роута, а не отдельным адресом, — как
// у плана объезда (`/api/admin/visit-plans`): два адреса пришлось бы
// держать в согласии, и однажды они разошлись бы.
//
// Курьер опознаётся ИМЕНЕМ из сессии, как `Task.assignee` и подпись чека
// кассы: связи «сессия → Employee» в проекте нет, и заводить её ради
// доставки значило бы менять вход в админку.
// ══════════════════════════════════════════════════════════════════════

function isOwner(request: Request): boolean {
  return isAuthorized(request);
}

/** Имя вошедшего — им подписаны маршруты курьера. */
function actorName(request: Request): string {
  return getSession(request)?.name?.trim() || '';
}

export async function GET(request: Request) {
  if (!isStaff(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');

  const where: Record<string, unknown> = {};
  if (status) where.status = status;

  // Курьеру — только его рейсы. Пустое имя в сессии не должно означать
  // «все»: тогда сотрудник без имени видел бы чужие адреса и телефоны.
  // Поэтому отсутствие имени — это пустой ответ, а не отсутствие фильтра.
  if (!isOwner(request)) {
    const name = actorName(request);
    if (!name) return NextResponse.json([]);
    where.driver = { name };
  }

  try {
    const routes = await prisma.deliveryRoute.findMany({
      where,
      include: {
        driver: true,
        stops: {
          include: {
            order: true
          },
          orderBy: {
            orderIndex: 'asc'
          }
        }
      },
      orderBy: {
        date: 'desc'
      }
    });
    return NextResponse.json(routes);
  } catch (error: unknown) {
    console.error('Error fetching delivery routes:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { driverId, date, stops } = body;
    
    // stops is an array of { address, phone, orderId, orderIndex, note }
    
    const route = await prisma.deliveryRoute.create({
      data: {
        driverId,
        date: new Date(date),
        stops: {
          create: stops?.map((s: { address: string; phone?: string; orderId?: string; orderIndex?: number; note?: string; }) => ({
            address: s.address,
            phone: s.phone,
            orderId: s.orderId,
            orderIndex: s.orderIndex || 0,
            note: s.note,
          })) || []
        }
      },
      include: {
        stops: true
      }
    });

    return NextResponse.json(route, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating route:', error);
    return NextResponse.json({ error: 'Failed to create route' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, driverId, status } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing route ID' }, { status: 400 });
    }

    const route = await prisma.deliveryRoute.update({
      where: { id },
      data: {
        driverId,
        status,
      }
    });

    return NextResponse.json(route);
  } catch (error: unknown) {
    console.error('Error updating route:', error);
    return NextResponse.json({ error: 'Failed to update route' }, { status: 500 });
  }
}

/**
 * Отметка по ТОЧКЕ маршрута — то, ради чего курьеру вообще нужен экран.
 *
 * Статус точки существовал в схеме (`DeliveryStop.status`) и не менялся
 * ничем: доставку отмечали сменой статуса всего заказа, то есть рейс из
 * восьми адресов был виден как одно событие «доставлено» в конце дня.
 *
 * Когда закрыта последняя точка, закрывается и маршрут: отдельная кнопка
 * «завершить рейс» после последнего адреса — лишнее действие ради того,
 * что система и так знает.
 */
export async function PATCH(request: Request) {
  if (!isStaff(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { stopId, status } = body as { stopId?: string; status?: string };

    if (!stopId || !status) {
      return NextResponse.json({ error: 'Missing stopId or status' }, { status: 400 });
    }
    if (!['pending', 'delivered', 'failed'].includes(status)) {
      return NextResponse.json({ error: 'Unknown stop status' }, { status: 400 });
    }

    const stop = await prisma.deliveryStop.findUnique({
      where: { id: stopId },
      include: { route: { include: { driver: true } } },
    });
    if (!stop) {
      return NextResponse.json({ error: 'Stop not found' }, { status: 404 });
    }
    // Чужой рейс закрывать нельзя — ни по ошибке, ни намеренно.
    if (!isOwner(request) && stop.route.driver?.name !== actorName(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.deliveryStop.update({ where: { id: stopId }, data: { status } });

    const left = await prisma.deliveryStop.count({
      where: { routeId: stop.routeId, status: 'pending' },
    });
    if (left === 0) {
      await prisma.deliveryRoute.update({
        where: { id: stop.routeId },
        data: { status: 'completed' },
      });
    }

    return NextResponse.json({ success: true, routeCompleted: left === 0 });
  } catch (error: unknown) {
    console.error('Error updating stop:', error);
    return NextResponse.json({ error: 'Failed to update stop' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing route ID' }, { status: 400 });
  }

  try {
    await prisma.deliveryRoute.delete({
      where: { id }
    });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error deleting route:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}

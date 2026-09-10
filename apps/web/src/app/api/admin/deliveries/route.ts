import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { notifyCustomer } from '@/lib/notify';
import { actionButton, buttonRows } from '@/lib/telegram/adminLinks';
import { assignedPlanText } from '@/lib/customers/planMessage';
import { getSession, isAuthorized, isStaff } from '@/lib/adminAuth';
import { LIST_LIMIT } from '@/lib/api/listLimit';

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

/** Имя вошедшего. В сессии сотрудника лежит `Employee.name`. */
function actorName(request: Request): string {
  return getSession(request)?.name?.trim() || '';
}

/**
 * Сотрудник вошедшего — ПО ИДЕНТИФИКАТОРУ, а не по имени.
 *
 * ЗАЧЕМ. Рейс сохраняется с `driverId` (внешний ключ), а искали его по
 * `driver: { name }`. `Employee.name` НЕ уникально: два Азиза в штате — и
 * каждый видит рейсы обоих, то есть чужие адреса, телефоны и заказы.
 * Переименование сотрудника ломает то же самое с другой стороны: имя в
 * сессии живёт до конца её срока и перестаёт совпадать с базой, а курьер
 * видит «маршрут не назначен» при существующем рейсе.
 *
 * `null` — не опознали. Это ОТКАЗ, а не «показать всё»: пустое имя не
 * должно открывать чужую работу. Так же поступает трекинг.
 */
async function actorEmployeeId(request: Request): Promise<string | null> {
  const name = actorName(request);
  if (!name) return null;
  const matches = await prisma.employee.findMany({
    where: { name, isActive: true },
    select: { id: true },
    take: 2,
  });
  // Двое с одним именем — опознать некого. Показать рейс наугад значит
  // выдать одному человеку работу другого.
  return matches.length === 1 ? matches[0].id : null;
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
    const driverId = await actorEmployeeId(request);
    if (!driverId) return NextResponse.json([]);
    where.driverId = driverId;
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
      },
      take: LIST_LIMIT,
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

    // Водитель узнаёт о рейсе САМ — до этого не узнавал никак.
    void announceRoute(route.id);

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

    // Кому рейс принадлежал ДО правки: смена водителя — это новое
    // назначение для нового человека, и он о нём ещё не знает.
    const before = await prisma.deliveryRoute.findUnique({
      where: { id },
      select: { driverId: true },
    });
    const handedOver = Boolean(driverId) && before?.driverId !== driverId;

    const route = await prisma.deliveryRoute.update({
      where: { id },
      data: {
        driverId,
        status,
        // Снимаем отметку об отправке и подтверждение: сообщение уходило
        // прежнему водителю, а подтверждал его тоже он. Оставить их значит
        // показать владельцу «принял» про человека, который рейса не
        // видел. Прежнему сообщать нечего: у него рейс забрали, а не
        // поручили.
        ...(handedOver ? { announcedAt: null, acceptedAt: null } : {}),
      }
    });

    if (handedOver) void announceRoute(route.id);

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
    // Закрыть точку может владелец или ТОТ САМЫЙ курьер — сверяем по
    // идентификатору, а не по имени: тёзка не должен закрывать чужие
    // доставки.
    if (!isOwner(request) && stop.route.driverId !== (await actorEmployeeId(request))) {
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

/**
 * Сказать водителю о рейсе — один раз.
 *
 * ЧЕГО НЕ БЫЛО ВООБЩЕ. Водитель не узнавал о рейсе НИКАК: ни сообщения, ни
 * сигнала. Он должен был сам догадаться открыть админку и нажать «Мой
 * рейс» — при том, что в поле человек живёт в Telegram. Экран доставки
 * чинил отметку доставленного, а не то, откуда водитель узнаёт адреса;
 * до него их передавали голосом или скриншотом.
 *
 * ШЛЁМ ТОКЕНОМ БОТА ПРОДАЖ — там же, где вся полевая работа и куда
 * вернётся нажатие кнопки: Telegram отдаёт callback тому боту, чьим
 * токеном отправлено сообщение.
 *
 * ПОВТОРНО НЕ ШЛЁМ. Рейс правят по нескольку раз — добавили точку,
 * поменяли порядок; без отметки `announcedAt` человек получал бы то же
 * сообщение снова и снова.
 */
async function announceRoute(routeId: string): Promise<void> {
  try {
    const route = await prisma.deliveryRoute.findUnique({
      where: { id: routeId },
      select: {
        announcedAt: true,
        date: true,
        driver: { select: { telegramId: true, isActive: true } },
        stops: {
          orderBy: { orderIndex: 'asc' },
          select: { address: true, phone: true },
        },
      },
    });
    if (!route || route.announcedAt !== null) return;
    if (!route.driver?.isActive || !route.driver.telegramId) return;
    if (route.stops.length === 0) return;

    const text = assignedPlanText({
      dateLabel: route.date.toLocaleDateString('ru-RU'),
      // У рейса адрес вместо названия: заведение может быть не заведено в
      // CRM вовсе — доставку возят и разовым покупателям.
      stops: route.stops.map((s) => ({ name: s.address, done: false })),
    }).replace('🗺 <b>Объезд', '🚚 <b>Рейс');

    const sent = await notifyCustomer(
      route.driver.telegramId,
      text,
      buttonRows([actionButton('✅ Приступить', `route:accept:${routeId}`)]),
      process.env.SALES_BOT_TOKEN,
    );

    // Отмечаем только отправленное: иначе неудача Telegram навсегда
    // закрыла бы водителю возможность узнать о рейсе.
    if (sent) {
      await prisma.deliveryRoute.update({
        where: { id: routeId },
        data: { announcedAt: new Date() },
      });
    }
  } catch (err) {
    console.error('[deliveries] не сказали водителю о рейсе:', err);
  }
}

import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@repo/database';
import { requireBotAuth } from '@/lib/botAuth';
import { localDayRange } from '@/lib/localDate';
import { safeError } from '@/lib/safeError';
import { getNumber } from '@/lib/settings/store';
import { ongoingIdle } from '@/lib/tracking/idleNow';
import { SILENT_MIN } from '@/lib/tracking/ping';
import { presenceState } from '@/lib/tracking/presence';
import { readDayPlans } from '@/lib/customers/visitPlanStore';

// ══════════════════════════════════════════════════════════════════════
// Кто сегодня не на связи.
//
// ЗАЧЕМ ЭТА ДВЕРЬ. Трансляция геопозиции в Telegram живёт максимум восемь
// часов и включается вручную. Оба конца этого срока тихие: утром её просто
// забывают включить, а через восемь часов она гаснет сама, ничего никому
// не сказав. В обоих случаях день в отчёте окажется пустым — и выяснится
// это вечером, когда сделать уже ничего нельзя.
//
// ПОЧЕМУ HTTP, А НЕ СЫРОЙ SQL ИЗ ОФИСА. `track_pings` — таблица витрины,
// как и вся карта клиентов. Офис читает её через дверь, а не напрямую:
// иначе владение таблицей размывается ровно так, как это уже случалось с
// `products` и `crm_products`.
//
// РЕШЕНИЕ ЗДЕСЬ НЕ ПРИНИМАЕТСЯ. Роут отвечает фактом — «последняя крошка
// была тогда-то», — а решает бот: у него расписание, рабочие часы и право
// написать человеку.
// ══════════════════════════════════════════════════════════════════════

// Порог молчания и само решение — в `lib/tracking`: тем же числом живёт
// карта, подпись под человеком и разрыв связи в арифметике дня. Здесь была
// его четвёртая копия.

export async function GET(request: NextRequest) {
  try {
    if (!requireBotAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { start, end } = localDayRange();
    const now = Date.now();

    // Полевые — те, у кого есть Telegram: без него ни трансляции, ни
    // напоминания. Уволенных не трогаем.
    const staff = await prisma.employee.findMany({
      where: { isActive: true, telegramId: { not: null } },
      select: { id: true, name: true, telegramId: true },
    });
    if (staff.length === 0) return NextResponse.json({ status: 'ok', people: [] });

    const ids = staff.map((s) => s.id);

    const [days, shifts] = await Promise.all([
      prisma.fieldDay.findMany({
        where: { date: start, employeeId: { in: ids } },
        select: { employeeId: true, endedAt: true, startedAt: true },
      }),
      // ОТКРЫТАЯ СМЕНА — ГЛАВНЫЙ ПРИЗНАК «ЧЕЛОВЕК СЕГОДНЯ РАБОТАЕТ».
      //
      // Без неё сторож писал «смена не записывается» ВСЕМ активным
      // сотрудникам с Telegram — каждый рабочий день, включая тех, у кого
      // выходной, больничный или работа на складе. Напоминание, приходящее
      // в законный выходной, перестают читать вместе с нужными.
      prisma.shift.findMany({
        where: { employeeId: { in: ids }, date: start, type: 'work', startTime: { not: null } },
        select: { employeeId: true, startTime: true, endTime: true },
      }),
    ]);
    const dayOf = new Map(days.map((d) => [d.employeeId, d]));
    const shiftOf = new Map(shifts.map((s) => [s.employeeId, s]));

    // КТО СТОИТ НА МЕСТЕ. Считаем только для тех, у кого смена открыта и
    // крошки идут: у остальных вопрос другой — почему их не слышно.
    const live = staff.filter((person) => {
      const shift = shiftOf.get(person.id);
      return shift !== undefined && shift.endTime === null;
    });
    const idleOf = await ongoingIdle(live.map((p) => p.id), start, end, new Date(now));

    // ЧТО У ЧЕЛОВЕКА ПО ОБЪЕЗДУ И РЕЙСУ. Сторож спрашивает про людей раз в
    // полчаса — и здесь же узнаёт, сдвинулась ли работа. Отдельная дверь
    // повторила бы и состав людей, и правило «кто сегодня работает».
    const [plans, routes, halfMinutes] = await Promise.all([
      readDayPlans({ planDate: start }),
      prisma.deliveryRoute.findMany({
        where: { date: start, driverId: { in: ids } },
        select: { driverId: true, stops: { select: { status: true } } },
      }),
      getNumber('field.dayHalfMinutes'),
    ]);
    const planOf = new Map(plans.map((p) => [p.assignee, p]));
    const routeOf = new Map(routes.map((r) => [r.driverId, r]));

    const people = staff.map((person) => {
      const day = dayOf.get(person.id);
      const shift = shiftOf.get(person.id);
      // `endedAt` — время последней крошки: его двигает каждый приём трека.
      const last = day?.endedAt ?? day?.startedAt ?? null;
      const silentMin = last === null ? null : Math.round((now - last.getTime()) / 60_000);
      const shiftOpen = shift !== undefined && shift.endTime === null;
      const state = presenceState(shiftOpen, silentMin);

      const plan = planOf.get(person.name);
      const route = routeOf.get(person.id);
      const planTotal = plan?.stops.length ?? 0;
      const planDone = plan?.doneCount ?? 0;
      const routeStops = route?.stops ?? [];
      const routeTotal = routeStops.length;
      const routeDone = routeStops.filter((st) => (st.status || 'pending') !== 'pending').length;

      // ПОЛДНЯ СЧИТАЕТСЯ ОТ НАЧАЛА СМЕНЫ, а не по часам на стене. Открыл
      // смену в 11:00 — в 13:00 у него не полдня, и спрашивать не о чем.
      // Отдаём боту ГОТОВЫЙ ответ: число живёт в настройках владельца, и
      // второй его копии в Python быть не должно.
      const startedAt = shift?.startTime ?? null;
      const planHalfDay =
        shiftOpen && startedAt !== null && now - startedAt.getTime() >= halfMinutes * 60_000;

      return {
        // BigInt в JSON не сериализуется — отдаём строкой, как и везде,
        // где наружу уходит telegram_id.
        telegramId: String(person.telegramId),
        name: person.name,
        /**
         * Состояние человека — см. `presenceState`.
         *
         * `off` появился отдельным значением, а не молчанием роута:
         * решение «писать или нет» принимает бот, и отнимать у него факт
         * значило бы прятать причину.
         */
        state,
        silentMin,
        shiftOpen,
        shiftStartedAt: shift?.startTime ?? null,
        /**
         * Сколько минут стоит на месте не у клиента. `null` — не стоит.
         *
         * ОТДЕЛЬНЫМ ПОЛЕМ, А НЕ ЗНАЧЕНИЕМ `state`: человек может стоять,
         * будучи полностью на связи, — это и есть тот случай, которого в
         * коде не существовало вовсе. Складывать его с молчанием значит
         * задать не тот вопрос: телефон в подвале и человек на диване
         * выглядели бы одинаково.
         */
        idleMin: state === 'ok' ? (idleOf.get(person.id) ?? null) : null,
        /**
         * Сколько точек назначено и сколько отмечено — объезд и рейс.
         *
         * Нужно для одного вопроса: сдвинулась ли работа за полсмены. Доля
         * выполнения среди дня здесь НЕ считается намеренно — «половина
         * точек в четыре часа дня это обычный рабочий день, а не срыв»
         * (`planOutcome.ts`), и пересматривать это решение сторожу нечем.
         */
        planTotal,
        planDone,
        routeTotal,
        routeDone,
        planHalfDay,
      };
    });

    return NextResponse.json({
      status: 'ok',
      silentAfterMin: SILENT_MIN,
      // Порог простоя — из настроек владельца. Бот своей копии не держит:
      // владелец правит число в админке, и сообщение обязано измениться
      // вместе с экраном, а не после пересборки контейнера.
      idleAfterMin: await getNumber('field.idleMinutes'),
      dayHalfMinutes: halfMinutes,
      people,
      day: { start, end },
    });
  } catch (error: unknown) {
    console.error('API Admin Tracking Silent GET Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@repo/database';
import { isAuthorized } from '@/lib/adminAuth';
import { localDayRange } from '@/lib/localDate';
import { safeError } from '@/lib/safeError';
import { chronological } from '@/lib/tracking/liveTrack';
import { SILENT_MIN } from '@/lib/tracking/ping';

// ══════════════════════════════════════════════════════════════════════
// Кто сейчас в поле и где.
//
// ЗАЧЕМ ОТДЕЛЬНО ОТ ОТЧЁТА ДНЯ. Отчёт отвечает на вопрос «как прошёл
// вторник» — его открывают вечером и по одному человеку. Здесь вопрос
// другой и задаётся посреди дня: «где сейчас все». Это разные экраны и
// разная частота: отчёт читают раз, живую карту обновляют минутами.
//
// ТОЛЬКО ВЛАДЕЛЬЦУ. Видеть, где сейчас коллега, продавцу незачем: это
// слежка сотрудников друг за другом, а не работа. Отчёт дня продавец
// открывает про себя — там рубеж мягче.
//
// ЧТО ОТДАЁМ. Трек с начала смены и последнюю точку. Трек нужен, чтобы
// «стоит сорок минут» отличалось от «только что приехал»: одна точка на
// карте этого не говорит.
// ══════════════════════════════════════════════════════════════════════

/** Точек на человека. Больше на экране всё равно не разобрать. */
const MAX_POINTS = 400;

/**
 * Берём СВЕЖИЕ, а не первые за день.
 *
 * Раньше стояло `orderBy: at asc` с тем же пределом, и «последняя точка»
 * означала четырёхсотую: после неё пин замирал там, где человек был утром,
 * а «молчит N мин» росло без конца — при живом, едущем человеке.
 */
const NEWEST_FIRST = { at: 'desc' } as const;

export async function GET(request: NextRequest) {
  try {
    // Рубеж здесь, а не в middleware: там правило стоит на префиксе
    // `/api/admin/tracking` как STAFF ради приёма крошек от продавца.
    //
    // `isAuthorized`, а не проверка роли: она пускает владельца ИЛИ бота по
    // общему секрету и так же не пускает продавца — ровно правило из шапки.
    // Пока стояла проверка роли, сводка «кто сейчас в поле» в Telegram не
    // работала НИ РАЗУ: бот шлёт секрет, а не сессию, и получал 403 —
    // молча, в свой лог (`apps/tgas/shared/field_track.py::who_is_in_field`).
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Только владельцу' }, { status: 403 });
    }

    const { start, end } = localDayRange();

    // Один человек — та же дверь с параметром, а не своя.
    //
    // Экран слежения спрашивает ровно того, за кем смотрят. Отдельный роут
    // конституция считает дефектом, и главное — рубеж тогда пришлось бы
    // повторить второй раз: две двери расходятся, одна не может.
    const only = request.nextUrl.searchParams.get('employee') ?? '';

    const days = await prisma.fieldDay.findMany({
      where: only ? { date: start, employeeId: only } : { date: start },
      select: {
        employeeId: true,
        startedAt: true,
        endedAt: true,
        meters: true,
        stops: true,
        employee: { select: { id: true, name: true } },
      },
    });

    if (days.length === 0) {
      return NextResponse.json({ status: 'ok', people: [], at: Date.now() });
    }

    const people = await Promise.all(
      days.map(async (day) => {
        const rows = await prisma.trackPing.findMany({
          where: { employeeId: day.employeeId, at: { gte: start, lt: end } },
          select: { at: true, latitude: true, longitude: true, accuracyM: true, source: true },
          orderBy: NEWEST_FIRST,
          // На одну больше предела — только чтобы отличить «ровно предел»
          // от «не поместилось». В путь эта строка не идёт.
          take: MAX_POINTS + 1,
        });

        const { track, last, trimmed } = chronological(rows, MAX_POINTS);

        // Сколько крошек всего. Нужно для частоты («раз в девять минут» при
        // ожидаемых сорока пяти секундах — это и есть диагноз усыплённого
        // сторожа). Отдельный запрос только когда день не поместился: иначе
        // ответ уже в руках, и лишний счёт был бы данью форме.
        const points = trimmed
          ? await prisma.trackPing.count({
              where: { employeeId: day.employeeId, at: { gte: start, lt: end } },
            })
          : track.length;

        return {
          id: day.employee.id,
          name: day.employee.name,
          startedAt: day.startedAt,
          meters: day.meters,
          stops: day.stops,
          track,
          last,
          // Хвост дня не поместился. Без этой пометки кусок пути рисовался
          // бы молча под подписью «с 02:03» — карта утверждала бы больше,
          // чем знает.
          trimmed,
          points,
          // Чем снята последняя крошка: приложением, вкладкой браузера или
          // Telegram. По этому полю и отвечают на «почему линия прямая».
          lastSource: last?.source ?? null,
          // Сколько минут молчит. По этому числу владелец и понимает,
          // живая это точка или «здесь он был час назад»: показывать
          // старую позицию как текущую значит врать картой.
          silentMin:
            last === null ? null : Math.round((Date.now() - last.at.getTime()) / 60_000),
        };
      }),
    );

    // Кто дольше молчит — выше: именно он и есть повод спросить.
    //
    // А выше всех — тот, кто не прислал НИ ОДНОЙ точки: `silentMin === null`.
    // Прежняя строка читала его как ноль и опускала в самый низ — то есть
    // ровно того, о ком спросить нужнее всего, прятала за теми, кто молчит
    // пять минут.
    people.sort((a, b) => {
      if (a.silentMin === b.silentMin) return 0;
      if (a.silentMin === null) return -1;
      if (b.silentMin === null) return 1;
      return b.silentMin - a.silentMin;
    });

    // `silentAfterMin` — с какой минуты молчание перестаёт быть моргнувшей
    // сетью. Отдаём вместе с людьми, чтобы бот не держал своей копии числа:
    // сводка в Telegram и подпись на карте должны звать «молчит» одного и
    // того же человека.
    return NextResponse.json({ status: 'ok', people, silentAfterMin: SILENT_MIN, at: Date.now() });
  } catch (error: unknown) {
    console.error('API Admin Tracking Live GET Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

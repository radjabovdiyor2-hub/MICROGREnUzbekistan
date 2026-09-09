import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@repo/database';
import { requireBotAuth } from '@/lib/botAuth';
import { localDayRange } from '@/lib/localDate';
import { safeError } from '@/lib/safeError';

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

/**
 * Молчание, после которого стоит спросить.
 *
 * Трансляция шлёт точку примерно раз в минуту. Пятнадцать — это уже не
 * туннель и не подвал: столько подряд не молчит даже плохая сеть в
 * центре. Меньше — и бот начнёт писать человеку на каждый лифт.
 */
const SILENT_MIN = 15;

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

    const days = await prisma.fieldDay.findMany({
      where: { date: start, employeeId: { in: staff.map((s) => s.id) } },
      select: { employeeId: true, endedAt: true, startedAt: true },
    });
    const dayOf = new Map(days.map((d) => [d.employeeId, d]));

    const people = staff.map((person) => {
      const day = dayOf.get(person.id);
      // `endedAt` — время последней крошки: его двигает каждый приём трека.
      const last = day?.endedAt ?? day?.startedAt ?? null;
      const silentMin = last === null ? null : Math.round((now - last.getTime()) / 60_000);

      return {
        // BigInt в JSON не сериализуется — отдаём строкой, как и везде,
        // где наружу уходит telegram_id.
        telegramId: String(person.telegramId),
        name: person.name,
        /** `never` — сегодня не начинал, `silent` — замолчал, `ok` — на связи. */
        state: last === null ? 'never' : (silentMin ?? 0) >= SILENT_MIN ? 'silent' : 'ok',
        silentMin,
      };
    });

    return NextResponse.json({ status: 'ok', silentAfterMin: SILENT_MIN, people, day: { start, end } });
  } catch (error: unknown) {
    console.error('API Admin Tracking Silent GET Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

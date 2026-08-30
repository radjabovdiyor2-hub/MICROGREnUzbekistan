// ══════════════════════════════════════════════════════════════════════
// Расписание заездов: к кому ездим регулярно и по каким дням.
//
// ЧЕГО НЕ БЫЛО. План (`visit-plans`) отвечает за конкретный день и
// собирается заново каждое утро. «К этому заезжать по субботам» не жило
// нигде, кроме памяти продавца, — и уходило вместе с ним. Из-за этого
// объезд собирался по тем, кого помнят, а не по тем, к кому пора.
//
// РАСПИСАНИЕ НЕ СОЗДАЁТ ОБЪЕЗД САМО. Оно отвечает на вопрос «кого ставить
// в план на эту дату», а ставит человек. Тот же принцип, что у автоплана:
// план — предложение, а не приказ, потому что о ремонте в зале и об обеде
// на кухне знает только человек.
//
// GET    ?customerId= | ?weekday= | ?date=YYYY-MM-DD — читать
// PUT    { customerId, weekdays[], assignee? }       — заменить целиком
// ══════════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@repo/database';
import { actorOf, isStaff, unauthorized } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';
import { parseBody } from '@/lib/api/parseBody';
import { LIST_LIMIT } from '@/lib/api/listLimit';
import { safeError } from '@/lib/safeError';
import { isoWeekday, isWeekday, type Weekday } from '@/lib/customers/visitSchedule';

export const dynamic = 'force-dynamic';

const putSchema = z.object({
  customerId: z.number().int().positive(),
  /** Полный набор дней клиента: пустой массив снимает расписание. */
  weekdays: z.array(z.number().int().min(1).max(7)).max(7),
  assignee: z.string().trim().max(255).optional(),
  note: z.string().trim().max(255).optional().nullable(),
});

/** Дата из строки `YYYY-MM-DD`. Мусор и пусто — сегодня. */
function readDate(raw: string | null): Date {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

export async function GET(request: NextRequest) {
  if (!isStaff(request)) return unauthorized();

  try {
    const sp = request.nextUrl.searchParams;
    const customerId = Number(sp.get('customerId'));

    // Расписание одного клиента — для карточки на карте.
    if (Number.isInteger(customerId) && customerId > 0) {
      const rows = await prisma.visitSchedule.findMany({
        where: { customerId },
        orderBy: { weekday: 'asc' },
      });
      return NextResponse.json(rows);
    }

    // Кого ставить в объезд на этот день. `date` удобнее для экрана
    // планирования: он и так знает дату, а не номер дня недели.
    const rawDay = Number(sp.get('weekday'));
    const weekday: Weekday = isWeekday(rawDay) ? rawDay : isoWeekday(readDate(sp.get('date')));

    const rows = await prisma.visitSchedule.findMany({
      where: { weekday },
      take: LIST_LIMIT,
      include: {
        customer: {
          select: {
            id: true, name: true, phone: true, address: true,
            latitude: true, longitude: true, companyType: true, district: true,
          },
        },
      },
      orderBy: { customerId: 'asc' },
    });

    return NextResponse.json({ weekday, items: rows });
  } catch (error: unknown) {
    console.error('[/api/admin/visit-schedules] GET:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!isStaff(request)) return unauthorized();

  const parsed = await parseBody(request, putSchema);
  if (!parsed.ok) return parsed.response;
  const { customerId, weekdays, assignee = '', note } = parsed.data;

  try {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true },
    });
    if (!customer) return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });

    // Набор дней ЗАМЕНЯЕТСЯ целиком, а не дополняется: экран присылает
    // полное состояние переключателей, и разбирать разницу на клиенте
    // значило бы завести второй источник правды о том, что выбрано.
    const days = [...new Set(weekdays)].filter(isWeekday).sort((a, b) => a - b);

    await prisma.$transaction([
      prisma.visitSchedule.deleteMany({ where: { customerId, assignee } }),
      ...(days.length > 0
        ? [prisma.visitSchedule.createMany({
            data: days.map((weekday) => ({ customerId, weekday, assignee, note: note || null })),
          })]
        : []),
    ]);

    audit({
      action: days.length > 0 ? 'visit.schedule.set' : 'visit.schedule.clear',
      ...actorOf(request),
      ip: request.headers.get('x-forwarded-for') ?? undefined,
      target: `${customer.name} → ${days.join(',') || 'нет'}`,
      meta: { customerId, assignee: assignee || 'любой' },
    });

    return NextResponse.json({ ok: true, customerId, weekdays: days });
  } catch (error: unknown) {
    console.error('[/api/admin/visit-schedules] PUT:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

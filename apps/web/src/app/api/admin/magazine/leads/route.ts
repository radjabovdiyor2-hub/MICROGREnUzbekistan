import { NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { LIST_LIMIT } from '@/lib/api/listLimit';
import { parseBody } from '@/lib/api/parseBody';

// ══════════════════════════════════════════════════════════════════════
// Заявки на печатный номер: кто просил журнал в руки и кто за него заплатил.
//
// ⚠️ ЗДЕСЬ БЫЛА ТА ЖЕ ДЫРА, ЧТО У РЕКЛАМОДАТЕЛЕЙ, и осталась последней в
// журнале: ни один метод не проверял прав. Роут лежит под `/api/admin` и
// его прикрывает middleware — но все остальные роуты журнала проверяют
// себя ещё и сами, и не зря: matcher middleware исключает часть путей, а
// обращение мимо него прошло бы вообще без проверки.
//
// `isPaid` теперь разбирается схемой. Строка «true» вместо булева значения
// роняла запрос пятисоткой из глубины Prisma — вместо внятного «400».
// ══════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  userId: z.string().trim().min(1).max(64).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  isPaid: z.boolean(),
});

export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const leads = await prisma.magazineSubscriber.findMany({
      where: { type: 'print' },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
    return NextResponse.json(leads);
  } catch (error: unknown) {
    console.error('[/api/admin/magazine/leads] GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  const parsed = await parseBody(request, updateSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const updated = await prisma.magazineSubscriber.update({
      where: { id: parsed.data.id },
      data: { isPaid: parsed.data.isPaid },
    });
    return NextResponse.json(updated);
  } catch (error: unknown) {
    console.error('[/api/admin/magazine/leads] PATCH:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  const parsed = await parseBody(request, createSchema);
  if (!parsed.ok) return parsed.response;

  // Ни телефона, ни адреса — заявку некуда исполнить: печатный номер
  // возят по адресу, а не по идентификатору.
  if (!parsed.data.phone && !parsed.data.address) {
    return NextResponse.json(
      { error: 'Нужен телефон или адрес — иначе номер некуда везти' },
      { status: 400 },
    );
  }

  try {
    const lead = await prisma.magazineSubscriber.create({
      data: {
        userId: parsed.data.userId ?? null,
        phone: parsed.data.phone ?? null,
        address: parsed.data.address ?? null,
        type: 'print',
      },
    });
    return NextResponse.json(lead);
  } catch (error: unknown) {
    console.error('[/api/admin/magazine/leads] POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

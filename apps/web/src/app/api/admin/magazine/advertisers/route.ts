import { NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { LIST_LIMIT } from '@/lib/api/listLimit';
import { parseBody } from '@/lib/api/parseBody';

// ══════════════════════════════════════════════════════════════════════
// Рекламодатели журнала.
//
// ⚠️ ЗДЕСЬ БЫЛИ ДВЕ ДЫРЫ, обе тихие.
//
// 1. Ни один метод не проверял прав. Роут лежит под `/api/admin` и его
//    прикрывает middleware — но соседние роуты журнала проверяют себя ещё
//    и сами, и не зря: matcher middleware исключает часть путей, а
//    обращение мимо него прошло бы вообще без проверки.
//
// 2. Тело запроса уходило в базу ЦЕЛИКОМ: `prisma.advertiser.create({ data })`
//    и `update({ data: updateData })`. То есть присланное поле попадало в
//    колонку как есть — включая `createdAt`, `id` и `amount` (сумма
//    контракта). Ровно тот же класс, что был у правки долга.
//
// Теперь тело разбирается схемой, а поля перечислены поимённо.
// ══════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic';

/** Стадии работы с рекламодателем: интерес → контракт → прошлое. */
const STATUS = ['lead', 'active', 'past'] as const;

/** Что продаём: обложка с AR, разворот, полоса. */
const FORMAT = ['cover_ar', 'spread', 'page'] as const;

const fields = {
  companyName: z.string().trim().min(1).max(255),
  contactPerson: z.string().trim().max(255).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().max(255).optional().nullable(),
  status: z.enum(STATUS).optional(),
  format: z.enum(FORMAT).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  // Сумма контракта в сумах: целая и неотрицательная.
  amount: z.number().int().min(0).max(10_000_000_000).optional().nullable(),
};

const createSchema = z.object(fields);
const updateSchema = z.object({ id: z.string().min(1) }).extend({
  companyName: fields.companyName.optional(),
  contactPerson: fields.contactPerson,
  phone: fields.phone,
  email: fields.email,
  status: fields.status,
  format: fields.format,
  notes: fields.notes,
  amount: fields.amount,
});

export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const advertisers = await prisma.advertiser.findMany({
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
    return NextResponse.json(advertisers);
  } catch (error: unknown) {
    console.error('[/api/admin/magazine/advertisers] GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  const parsed = await parseBody(request, createSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const created = await prisma.advertiser.create({ data: parsed.data });
    return NextResponse.json(created);
  } catch (error: unknown) {
    console.error('[/api/admin/magazine/advertisers] POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  const parsed = await parseBody(request, updateSchema);
  if (!parsed.ok) return parsed.response;

  const { id, ...data } = parsed.data;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Нечего менять' }, { status: 400 });
  }

  try {
    const updated = await prisma.advertiser.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (error: unknown) {
    console.error('[/api/admin/magazine/advertisers] PATCH:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

  try {
    await prisma.advertiser.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[/api/admin/magazine/advertisers] DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

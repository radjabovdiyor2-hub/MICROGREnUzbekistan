import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@repo/database';

import { actorOf, isAuthorized, unauthorized } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';
import { parseBody } from '@/lib/api/parseBody';
import { safeError } from '@/lib/safeError';
import { CONTACT_ROLES } from '@/lib/customers/contactRoles';

// ══════════════════════════════════════════════════════════════════════
// Контактные лица заведения.
//
// ЗАЧЕМ. У заведения контакт почти никогда не один, и роли разные: продукт
// выбирает шеф, а закупку утверждает управляющий или владелец. Пока
// записано одно имя, переговоры о цене уходят к тому, кто её не решает, —
// и это выясняется в конце разговора.
//
// Подроут в группе клиентов, а не своя группа: контакт не существует сам
// по себе, он всегда чей-то.
// ══════════════════════════════════════════════════════════════════════

const createSchema = z.object({
  customerId: z.number().int().positive(),
  name: z.string().trim().min(1).max(255),
  role: z.enum(CONTACT_ROLES),
  phone: z.string().trim().max(20).optional().nullable(),
  decides: z.boolean().optional(),
  note: z.string().trim().max(2000).optional().nullable(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(255).optional(),
  role: z.enum(CONTACT_ROLES).optional(),
  phone: z.string().trim().max(20).optional().nullable(),
  decides: z.boolean().optional(),
  note: z.string().trim().max(2000).optional().nullable(),
});

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const customerId = Number(new URL(request.url).searchParams.get('customerId'));
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return NextResponse.json({ error: 'Нужен customerId' }, { status: 400 });
  }

  try {
    const contacts = await prisma.customerContact.findMany({
      where: { customerId },
      // Решающий — первым: с него начинают разговор о цене.
      orderBy: [{ decides: 'desc' }, { createdAt: 'asc' }],
    });
    return NextResponse.json({ status: 'ok', contacts });
  } catch (error: unknown) {
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const parsed = await parseBody(request, createSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const created = await prisma.customerContact.create({ data: parsed.data });

    audit({
      action: 'customer.contact.create',
      ...actorOf(request),
      ip: request.headers.get('x-forwarded-for') ?? undefined,
      target: `#${parsed.data.customerId}`,
      meta: { role: parsed.data.role, decides: !!parsed.data.decides },
    });

    return NextResponse.json({ status: 'ok', contact: created }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const parsed = await parseBody(request, updateSchema);
  if (!parsed.ok) return parsed.response;

  const { id, ...rest } = parsed.data;

  try {
    const updated = await prisma.customerContact.update({ where: { id }, data: rest });
    return NextResponse.json({ status: 'ok', contact: updated });
  } catch (error: unknown) {
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Нужен id' }, { status: 400 });

  try {
    const removed = await prisma.customerContact.delete({ where: { id } });

    audit({
      action: 'customer.contact.delete',
      ...actorOf(request),
      ip: request.headers.get('x-forwarded-for') ?? undefined,
      target: `#${removed.customerId}`,
      meta: { name: removed.name, role: removed.role },
    });

    return NextResponse.json({ status: 'ok' });
  } catch (error: unknown) {
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

// ════════════════════════════════════════════════════════════
// Модерация кадров гостей.
// GET    ?restaurantId=…&status=pending — очередь на просмотр
// PATCH  { id, status }                 — одобрить / отклонить / отметить напечатанным
// DELETE ?id=…                          — удалить кадр совсем
//
// Ручная модерация обязательна: одобренные кадры печатаются в номере
// и висят на публичной витрине ресторана.
// ════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

const STATUSES = ['pending', 'approved', 'printed', 'rejected'] as const;

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();
  const url = new URL(req.url);
  const restaurantId = url.searchParams.get('restaurantId') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;

  const photos = await prisma.guestPhoto.findMany({
    where: {
      ...(restaurantId ? { restaurantId } : {}),
      ...(status ? { status } : {}),
    },
    include: { dish: { select: { nameRu: true } }, restaurant: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 120,
  });
  return NextResponse.json(photos);
}

export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();
  const body = await req.json().catch(() => null);
  if (!body?.id || !body?.status) {
    return NextResponse.json({ error: 'id and status required' }, { status: 400 });
  }
  if (!STATUSES.includes(body.status)) {
    return NextResponse.json({ error: `status must be one of: ${STATUSES.join(', ')}` }, { status: 400 });
  }
  const photo = await prisma.guestPhoto.update({
    where: { id: body.id },
    data: { status: body.status },
  });
  return NextResponse.json(photo);
}

export async function DELETE(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await prisma.guestPhoto.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

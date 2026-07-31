import { NextResponse } from 'next/server';
import { prisma, Prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { defaultSharedSpec } from '@/lib/magazine/defaults';

export const dynamic = 'force-dynamic';

// Общий 50% — выпуск недели, одинаковый для всех ресторанов.

export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const editions = await prisma.magazineEdition.findMany({
      orderBy: { weekNumber: 'desc' },
      include: { _count: { select: { issues: true } } },
    });
    return NextResponse.json(editions);
  } catch (error: unknown) {
    console.error('[/api/admin/magazine/editions] GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const d = await request.json();
    const weekNumber = Number(d.weekNumber);
    if (!weekNumber) return NextResponse.json({ error: 'weekNumber is required' }, { status: 400 });

    const created = await prisma.magazineEdition.create({
      data: {
        weekNumber,
        title: d.title || `Выпуск №${weekNumber}`,
        coverTheme: d.coverTheme || null,
        // Стартовый общий контент, если не передан — редактируется в админке
        sharedSpec: (d.sharedSpec ?? defaultSharedSpec(weekNumber)) as unknown as Prisma.InputJsonValue,
      },
    });
    return NextResponse.json(created);
  } catch (error: unknown) {
    console.error('[/api/admin/magazine/editions] POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const d = await request.json();
    const { id } = d;
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    const data: Prisma.MagazineEditionUpdateInput = {};
    if ('title' in d) data.title = d.title;
    if ('coverTheme' in d) data.coverTheme = d.coverTheme || null;
    if ('sharedSpec' in d) data.sharedSpec = d.sharedSpec;
    if ('isPublished' in d) {
      data.isPublished = !!d.isPublished;
      data.publishedAt = d.isPublished ? new Date() : null;
    }

    const updated = await prisma.magazineEdition.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (error: unknown) {
    console.error('[/api/admin/magazine/editions] PATCH:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    await prisma.magazineEdition.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[/api/admin/magazine/editions] DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { prisma, Prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { defaultPersonalSpec } from '@/lib/magazine/defaults';
import { prismaErrorCode } from '@/lib/safeError';

export const dynamic = 'force-dynamic';

// Персональный 50% — сборка выпуска под конкретный ресторан.

export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const { searchParams } = new URL(request.url);
    const editionId = searchParams.get('editionId');
    const issues = await prisma.restaurantIssue.findMany({
      where: editionId ? { editionId } : undefined,
      include: { restaurant: true, edition: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(issues);
  } catch (error: unknown) {
    console.error('[/api/admin/magazine/issues] GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const d = await request.json();
    if (!d.editionId || !d.restaurantId) {
      return NextResponse.json({ error: 'editionId и restaurantId обязательны' }, { status: 400 });
    }
    const [edition, restaurant] = await Promise.all([
      prisma.magazineEdition.findUnique({ where: { id: d.editionId } }),
      prisma.restaurant.findUnique({ where: { id: d.restaurantId } }),
    ]);
    if (!edition || !restaurant) {
      return NextResponse.json({ error: 'Выпуск или ресторан не найден' }, { status: 404 });
    }

    const baseSlug = restaurant.slug || restaurant.id;
    const webSlug = `${baseSlug}-w${edition.weekNumber}`;

    const created = await prisma.restaurantIssue.create({
      data: {
        editionId: d.editionId,
        restaurantId: d.restaurantId,
        webSlug,
        spec: (d.spec ?? defaultPersonalSpec(restaurant.name)) as unknown as Prisma.InputJsonValue,
        status: 'draft',
      },
    });
    return NextResponse.json(created);
  } catch (error: unknown) {
    // Уникальность webSlug / (editionId, restaurantId)
    if (prismaErrorCode(error) === 'P2002') {
      return NextResponse.json({ error: 'Выпуск для этого ресторана уже создан' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const d = await request.json();
    const { id } = d;
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    const data: Prisma.RestaurantIssueUpdateInput = {};
    if ('spec' in d) data.spec = d.spec;
    if ('pdfUrl' in d) data.pdfUrl = d.pdfUrl || null;
    if ('htmlUrl' in d) data.htmlUrl = d.htmlUrl || null;
    if ('status' in d) {
      data.status = d.status;
      data.publishedAt = d.status === 'published' ? new Date() : null;
    }

    const updated = await prisma.restaurantIssue.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (error: unknown) {
    console.error('[/api/admin/magazine/issues] PATCH:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    await prisma.restaurantIssue.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[/api/admin/magazine/issues] DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

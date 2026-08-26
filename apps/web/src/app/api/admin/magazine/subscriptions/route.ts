import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { isAuthorized } from '@/lib/adminAuth';
import { LIST_LIMIT } from '@/lib/api/listLimit';

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const subscriptions = await prisma.printSubscription.findMany({
      include: { restaurant: true },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
    return NextResponse.json(subscriptions);
  } catch (e: unknown) {
    console.error('[/api/admin/magazine/subscriptions] GET:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const data = await req.json();
    const sub = await prisma.printSubscription.create({
      data: {
        restaurantId: data.restaurantId,
        plan: data.plan || 'weekly',
        copiesPerIssue: data.copiesPerIssue,
        pricePerCopy: data.pricePerCopy,
        unitCost: data.unitCost || 4000,
        status: data.status || 'active',
      }
    });
    return NextResponse.json(sub);
  } catch (e: unknown) {
    console.error('[/api/admin/magazine/subscriptions] POST:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const data = await req.json();
    const id = String(data?.id ?? '');
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    // Закрытый список полей: тело уходило в базу целиком, и присланный
    // `restaurantId` переписывал, чьей вообще была подписка.
    const update: Record<string, unknown> = {};
    if (['weekly', 'biweekly', 'monthly'].includes(data.plan)) update.plan = data.plan;
    if (['active', 'paused', 'cancelled'].includes(data.status)) update.status = data.status;
    for (const field of ['copiesPerIssue', 'pricePerCopy', 'unitCost'] as const) {
      const value = Number(data[field]);
      if (Number.isInteger(value) && value >= 0) update[field] = value;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Нечего менять' }, { status: 400 });
    }

    const sub = await prisma.printSubscription.update({
      where: { id },
      data: update,
    });
    return NextResponse.json(sub);
  } catch (e: unknown) {
    console.error('[/api/admin/magazine/subscriptions] PATCH:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    await prisma.printSubscription.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    console.error('[/api/admin/magazine/subscriptions] DELETE:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

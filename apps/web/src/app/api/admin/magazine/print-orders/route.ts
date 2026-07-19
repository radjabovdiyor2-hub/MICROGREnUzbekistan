import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { isAuthorized } from '@/lib/adminAuth';
import { computeOrder } from '@/lib/magazine/printPricing';

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const isReport = req.nextUrl.searchParams.get('report') === '1';

    if (isReport) {
      const orders = await prisma.printOrder.findMany({
        where: { status: { not: 'cancelled' } }
      });
      const summary = orders.reduce((acc, order) => {
        acc.revenue += order.revenue;
        acc.cost += order.cost;
        acc.margin += order.margin;
        return acc;
      }, { revenue: 0, cost: 0, margin: 0 });
      return NextResponse.json(summary);
    }

    const orders = await prisma.printOrder.findMany({
      include: {
        restaurantIssue: {
          include: { restaurant: true, edition: true }
        },
        subscription: true
      },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(orders);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const data = await req.json();
    const { restaurantIssueId, subscriptionId, copies, unitPrice, unitCost } = data;
    
    const pricing = computeOrder(copies, unitPrice, unitCost);

    const order = await prisma.printOrder.create({
      data: {
        restaurantIssueId,
        subscriptionId: subscriptionId || null,
        copies,
        unitPrice,
        unitCost: unitCost || 4000,
        ...pricing,
        status: data.status || 'pending',
      }
    });
    return NextResponse.json(order);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const data = await req.json();
    const { id, ...updateData } = data;
    
    if (updateData.status === 'paid' && !updateData.paidAt) {
      updateData.paidAt = new Date();
    }

    const order = await prisma.printOrder.update({
      where: { id },
      data: updateData
    });
    return NextResponse.json(order);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    await prisma.printOrder.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

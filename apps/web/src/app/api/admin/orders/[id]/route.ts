import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { requireBotAuth } from '@/lib/botAuth';
import { syncOrderStatus } from '@/lib/orderSync';

// ==========================================
// Admin — single order fetch + status update (storefront bot admin buttons:
// apps/bot admin.py "order:confirm" / "order:cancel").
// A status change here notifies the customer and syncs the AI-office CRM.
// ==========================================

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireBotAuth(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: { include: { product: { select: { nameUz: true, nameRu: true } } } },
      user: { select: { firstName: true, phone: true } },
    },
  });
  if (!order) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ order });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireBotAuth(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  try {
    const body = await request.json();
    const { status, paymentStatus } = body;

    const data: Record<string, string> = {};
    if (status) data.status = status;
    if (paymentStatus) data.paymentStatus = paymentStatus;
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
    }

    const order = await prisma.order.update({
      where: { id },
      data,
      include: { user: { select: { telegramId: true, language: true } } },
    });

    // Notify the customer + mirror the status into the AI-office CRM.
    await syncOrderStatus(order);

    return NextResponse.json({ success: true, order });
  } catch (error) {
    console.error('Admin order update error:', error);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}

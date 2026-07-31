import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const leads = await prisma.magazineSubscriber.findMany({
      where: { type: 'print' },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(leads);
  } catch (error: unknown) {
    console.error('[/api/admin/magazine/leads] GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { id, isPaid } = await request.json();
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    const updated = await prisma.magazineSubscriber.update({
      where: { id },
      data: { isPaid },
    });
    return NextResponse.json(updated);
  } catch (error: unknown) {
    console.error('[/api/admin/magazine/leads] PATCH:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId, phone, address } = await request.json();
    
    const lead = await prisma.magazineSubscriber.create({
      data: {
        userId,
        phone,
        type: 'print',
        address
      }
    });
    return NextResponse.json(lead);
  } catch (error: unknown) {
    console.error('[/api/admin/magazine/leads] POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

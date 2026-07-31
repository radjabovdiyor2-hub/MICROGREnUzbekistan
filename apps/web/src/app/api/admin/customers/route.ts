import { NextRequest, NextResponse } from 'next/server';
import { prisma, Prisma } from '@repo/database';
import { safeError } from '@/lib/safeError';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const status = searchParams.get('status') || '';

    const where: Prisma.CustomerWhereInput = {};
    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { phone: { contains: query, mode: 'insensitive' } },
        { telegramUsername: { contains: query, mode: 'insensitive' } },
        { companyName: { contains: query, mode: 'insensitive' } },
      ];
    }

    if (status && status !== 'all') {
      where.status = status;
    }

    const customers = await prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({
      status: 'ok',
      customers: customers.map((c) => ({
        id: c.id,
        name: c.name || '—',
        phone: c.phone || '—',
        telegramId: c.telegramId ? c.telegramId.toString() : null,
        telegramUsername: c.telegramUsername || null,
        customerType: c.customerType,
        companyName: c.companyName || null,
        city: c.city,
        status: c.status,
        totalSpent: Number(c.totalSpent || 0),
        bonusBalance: Number(c.bonusBalance || 0),
        ordersCount: c.ordersCount,
        notes: c.notes || '',
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    console.error('API Admin Customers GET Error:', error);
    return NextResponse.json(
      { error: safeError(error) },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, bonusBalance, notes, city, companyName } = body;

    if (!id) {
      return NextResponse.json({ error: 'Customer ID is required' }, { status: 400 });
    }

    const updated = await prisma.customer.update({
      where: { id: Number(id) },
      data: {
        status: status !== undefined ? status : undefined,
        bonusBalance: bonusBalance !== undefined ? Number(bonusBalance) : undefined,
        notes: notes !== undefined ? notes : undefined,
        city: city !== undefined ? city : undefined,
        companyName: companyName !== undefined ? companyName : undefined,
      },
    });

    return NextResponse.json({
      status: 'ok',
      customer: {
        id: updated.id,
        status: updated.status,
        bonusBalance: Number(updated.bonusBalance || 0),
        notes: updated.notes,
      },
    });
  } catch (error: unknown) {
    console.error('API Admin Customers PUT Error:', error);
    return NextResponse.json(
      { error: safeError(error) },
      { status: 500 }
    );
  }
}

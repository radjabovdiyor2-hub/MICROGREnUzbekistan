import { NextRequest, NextResponse } from 'next/server';
import { prisma, Prisma } from '@repo/database';
import { safeError } from '@/lib/safeError';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const filter = (searchParams.get('status') || '').toLowerCase();

    const where: Prisma.CustomerWhereInput = {};
    if (query) {
      // Телефон ищем по цифрам: в базе он записан в нескольких форматах
      // («+998 66 233-45-67», «998662334567», «662334567»), и поиск по строке
      // как её набрал человек промахивался мимо своего же клиента.
      const digits = query.replace(/\D/g, '');
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { phone: { contains: query, mode: 'insensitive' } },
        { telegramUsername: { contains: query, mode: 'insensitive' } },
        { companyName: { contains: query, mode: 'insensitive' } },
        ...(digits.length >= 4
          ? [{ phone: { contains: digits.slice(-9) } } as Prisma.CustomerWhereInput]
          : []),
      ];
    }

    // b2b — это ТИП клиента (customer_type), а не статус. Раньше значение
    // подставлялось в `where.status` как есть, поэтому кнопка «B2B» всегда
    // возвращала пустой список: статуса «b2b» в базе не бывает. Та же история
    // была с «client» — такого статуса нет вовсе (есть lead/active/vip/churned).
    if (filter === 'b2b' || filter === 'b2c') {
      where.customerType = filter;
    } else if (filter && filter !== 'all') {
      where.status = filter;
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

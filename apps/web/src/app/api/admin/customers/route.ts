import { NextRequest, NextResponse } from 'next/server';
import { prisma, Prisma } from '@repo/database';
import { safeError } from '@/lib/safeError';
import { getCustomerCard } from '@/lib/customers/card';
import { setCustomerBonus } from '@/lib/customers/bonus';

// ══════════════════════════════════════════════════════════════════════
// Клиенты админки.
//
// GET без параметров — список (страницами), GET ?id=<n> — карточка целиком
// с историей заказов и обращениями. Сбор карточки живёт в lib/customers:
// в route.ts Next.js разрешает экспортировать только HTTP-обработчики.
// ══════════════════════════════════════════════════════════════════════

/** Страница списка. Раньше стояло `take: 100` без сдвига — 101-й клиент
 *  был недостижим ничем, кроме поиска по имени. */
const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // ── Карточка одного клиента ──────────────────────────────────────
    const idParam = searchParams.get('id');
    if (idParam) {
      const id = Number(idParam);
      if (!Number.isInteger(id) || id <= 0) {
        return NextResponse.json({ error: 'Invalid customer id' }, { status: 400 });
      }
      const card = await getCustomerCard(id);
      if (!card) {
        return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });
      }
      return NextResponse.json({ status: 'ok', customer: card });
    }

    // ── Список ───────────────────────────────────────────────────────
    const query = searchParams.get('q') || '';
    const filter = (searchParams.get('status') || '').toLowerCase();
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const limit = Math.min(Number(searchParams.get('limit')) || PAGE_SIZE, MAX_PAGE_SIZE);

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

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.customer.count({ where }),
    ]);

    return NextResponse.json({
      status: 'ok',
      total,
      page,
      hasMore: page * limit < total,
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
    const customerId = Number(id);

    // Баллы — отдельным путём: они лежат на аккаунте витрины, а не в карточке
    // CRM, и запись «как есть» в customers.bonus_balance ничего не начисляла.
    if (bonusBalance !== undefined) {
      const result = await setCustomerBonus(customerId, Number(bonusBalance));
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
    }

    const updated = await prisma.customer.update({
      where: { id: customerId },
      data: {
        status: status !== undefined ? status : undefined,
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
        city: updated.city,
        companyName: updated.companyName,
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

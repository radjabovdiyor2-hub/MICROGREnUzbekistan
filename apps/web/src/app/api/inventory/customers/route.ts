import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { isStaff, unauthorized } from '@/lib/adminAuth';

// ══════════════════════════════════════════════════════════════════════
// Поиск покупателя для кассы + его договорные цены.
//
// Отдельная дверь, а не `/api/admin/customers`: та открыта только владельцу
// и отдаёт карточку целиком — заметки, историю, координаты. Продавцу за
// прилавком нужно ровно два поля (имя и телефон) плюс цены по договору,
// и открывать ему всю CRM ради подстановки цены нельзя.
//
// Доступ STAFF: владелец и продавец.
// ══════════════════════════════════════════════════════════════════════

/** Сколько карточек показываем: касса — это список для выбора, не отчёт. */
const LIMIT = 10;

export async function GET(request: NextRequest) {
  if (!isStaff(request)) return unauthorized();

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') ?? '').trim();
  if (query.length < 2) return NextResponse.json({ customers: [] });

  const customers = await prisma.customer.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { companyName: { contains: query, mode: 'insensitive' } },
        { phone: { contains: query } },
      ],
    },
    select: { id: true, name: true, companyName: true, phone: true, customerType: true },
    orderBy: { lastOrderDate: 'desc' },
    take: LIMIT,
  });

  return NextResponse.json({ customers });
}

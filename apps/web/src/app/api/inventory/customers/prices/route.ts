import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { audit } from '@/lib/audit';
import { isAuthorized, isStaff, forbidden, unauthorized } from '@/lib/adminAuth';

// ══════════════════════════════════════════════════════════════════════
// Договорные цены клиента.
//
// Читать может касса (STAFF): по ним подставляется цена при выборе
// покупателя в чеке. Менять — только владелец: это деньги, а не удобство,
// и продавец, правящий договор с рестораном, обнулил бы весь смысл
// обязательной причины уступки.
// ══════════════════════════════════════════════════════════════════════

/** Действующие на сегодня цены клиента: id товара → цена. */
export async function GET(request: NextRequest) {
  if (!isStaff(request)) return unauthorized();

  const customerId = Number(new URL(request.url).searchParams.get('customerId'));
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return NextResponse.json({ error: 'customerId majburiy' }, { status: 400 });
  }

  const now = new Date();
  const prices = await prisma.customerPrice.findMany({
    where: {
      customerId,
      // Просроченную договорённость не подставляем: цена прошлого сезона,
      // подставленная молча, — это убыток, которого никто не заметит.
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
        { OR: [{ validTo: null }, { validTo: { gte: now } }] },
      ],
    },
    select: {
      id: true, productId: true, price: true, note: true,
      validFrom: true, validTo: true,
      product: { select: { nameUz: true, nameRu: true, unit: true, price: true } },
    },
  });

  return NextResponse.json({ prices });
}

/** Завести или изменить договорную цену. Только владелец. */
export async function PUT(request: NextRequest) {
  if (!isAuthorized(request)) return forbidden();

  const body = await request.json();
  const customerId = Number(body.customerId);
  const productId = String(body.productId ?? '').trim();
  const price = Number(body.price);

  if (!Number.isInteger(customerId) || customerId <= 0 || !productId) {
    return NextResponse.json({ error: "Mijoz va tovar majburiy" }, { status: 400 });
  }
  if (!Number.isInteger(price) || price <= 0) {
    return NextResponse.json({ error: `Narx noto'g'ri: ${String(body.price)}` }, { status: 400 });
  }

  const note = String(body.note ?? '').trim() || null;
  const validFrom = body.validFrom ? new Date(String(body.validFrom)) : null;
  const validTo = body.validTo ? new Date(String(body.validTo)) : null;
  if (validFrom && validTo && validFrom > validTo) {
    return NextResponse.json({ error: "Muddat noto'g'ri" }, { status: 400 });
  }

  const saved = await prisma.customerPrice.upsert({
    where: { customerId_productId: { customerId, productId } },
    create: { customerId, productId, price, note, validFrom, validTo },
    update: { price, note, validFrom, validTo },
  });

  audit({
    action: 'customer.price.set',
    actor: 'owner',
    role: 'ADMIN',
    ip: request.headers.get('x-forwarded-for') ?? undefined,
    target: `${customerId}:${productId}`,
    meta: { price, note },
  });

  return NextResponse.json({ success: true, price: saved });
}

/** Отменить договорённость. Только владелец. */
export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) return forbidden();

  const id = String(new URL(request.url).searchParams.get('id') ?? '').trim();
  if (!id) return NextResponse.json({ error: 'id majburiy' }, { status: 400 });

  await prisma.customerPrice.delete({ where: { id } });
  audit({
    action: 'customer.price.removed',
    actor: 'owner',
    role: 'ADMIN',
    ip: request.headers.get('x-forwarded-for') ?? undefined,
    target: id,
  });

  return NextResponse.json({ success: true });
}

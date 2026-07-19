import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

function slugify(s: string): string {
  const base = (s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return base || `resto-${Date.now().toString(36)}`;
}

// Фикс: промокод ресторана делаем рабочим — upsert в модель PromoCode,
// чтобы «скидка N% от ресторана» реально применялась в корзине.
async function upsertPromo(code?: string | null, discount?: number | null) {
  if (!code) return;
  await prisma.promoCode.upsert({
    where: { code },
    update: { discountType: 'percent', value: discount ?? 10, isActive: true },
    create: { code, discountType: 'percent', value: discount ?? 10, isActive: true },
  });
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const restaurants = await prisma.restaurant.findMany({
      where: { isMagazinePartner: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(restaurants);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const d = await request.json();
    const slug = slugify(d.slug || d.name);
    const created = await prisma.restaurant.create({
      data: {
        name: d.name,
        city: d.city || 'samarkand',
        cuisine: d.cuisine ?? [],
        tier: d.tier || 'premium',
        dishes: d.dishes ?? [],
        microgreens: d.microgreens ?? [],
        flowers: d.flowers ?? [],
        menuItems: d.menuItems ?? [],
        slug,
        logo: d.logo || null,
        instagram: d.instagram || null,
        brandPrimary: d.brandPrimary || null,
        brandAccent: d.brandAccent || null,
        promoCode: d.promoCode || null,
        promoDiscount: d.promoDiscount ? Number(d.promoDiscount) : null,
        isMagazinePartner: true,
        isPartner: true,
        contactName: d.contactName || null,
        phone: d.phone || null,
      },
    });
    await upsertPromo(created.promoCode, created.promoDiscount);
    return NextResponse.json(created);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const d = await request.json();
    const { id, ...rest } = d;
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    const data: any = {};
    for (const k of ['name', 'city', 'tier', 'logo', 'instagram', 'brandPrimary', 'brandAccent', 'promoCode', 'contactName', 'phone']) {
      if (k in rest) data[k] = rest[k] || null;
    }
    for (const k of ['cuisine', 'dishes', 'microgreens', 'flowers', 'menuItems']) {
      if (k in rest) data[k] = rest[k] ?? [];
    }
    if ('slug' in rest) data.slug = slugify(rest.slug);
    if ('promoDiscount' in rest) data.promoDiscount = rest.promoDiscount ? Number(rest.promoDiscount) : null;
    if ('isMagazinePartner' in rest) data.isMagazinePartner = !!rest.isMagazinePartner;

    const updated = await prisma.restaurant.update({ where: { id }, data });
    await upsertPromo(updated.promoCode, updated.promoDiscount);
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    await prisma.restaurant.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

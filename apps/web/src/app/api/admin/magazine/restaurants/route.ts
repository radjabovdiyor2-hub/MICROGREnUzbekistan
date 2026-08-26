import { NextResponse } from 'next/server';
import { prisma, Prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { slugify as makeSlug } from '@/lib/slug';
import { LIST_LIMIT } from '@/lib/api/listLimit';

export const dynamic = 'force-dynamic';

// Общий slugify: раньше здесь кириллица вырезалась целиком, и «Ресторан Джаз»
// вырождался в resto-<timestamp>. Теперь транслитерируется в restoran-dzhaz.
const slugify = (s: string) => makeSlug(s, 'resto');

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
      take: LIST_LIMIT,
    });
    return NextResponse.json(restaurants);
  } catch (error: unknown) {
    console.error('[/api/admin/magazine/restaurants] GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
  } catch (error: unknown) {
    console.error('[/api/admin/magazine/restaurants] POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const d = await request.json();
    const { id, ...rest } = d;
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    // Правка частичная: трогаем только те поля, что реально пришли в теле.
    // Раньше это был цикл по массиву строк с `data: any` — строковый ключ
    // нельзя проверить типом, и опечатка в имени поля молча создавала бы
    // мусорный ключ. Перечисляем поля явно: компилятор сверяет каждое.
    const data: Prisma.RestaurantUpdateInput = {};
    const text = (v: unknown): string | null => (v ? String(v) : null);
    const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

    // name / city / tier в схеме NOT NULL. Прежний общий цикл писал в них
    // `null`, когда поле в форме очищали, — Prisma такой update отвергает,
    // и вся правка ресторана падала целиком. Обязательные поля меняем
    // только на непустое значение, пустое означает «не трогать».
    if (text(rest.name)) data.name = String(rest.name);
    if (text(rest.city)) data.city = String(rest.city);
    if (text(rest.tier)) data.tier = String(rest.tier);
    if ('logo' in rest) data.logo = text(rest.logo);
    if ('instagram' in rest) data.instagram = text(rest.instagram);
    if ('brandPrimary' in rest) data.brandPrimary = text(rest.brandPrimary);
    if ('brandAccent' in rest) data.brandAccent = text(rest.brandAccent);
    if ('promoCode' in rest) data.promoCode = text(rest.promoCode);
    if ('contactName' in rest) data.contactName = text(rest.contactName);
    if ('phone' in rest) data.phone = text(rest.phone);

    if ('cuisine' in rest) data.cuisine = list(rest.cuisine);
    if ('dishes' in rest) data.dishes = list(rest.dishes);
    if ('microgreens' in rest) data.microgreens = list(rest.microgreens);
    if ('flowers' in rest) data.flowers = list(rest.flowers);
    if ('menuItems' in rest) data.menuItems = list(rest.menuItems);

    if ('slug' in rest) data.slug = slugify(rest.slug);
    if ('promoDiscount' in rest) data.promoDiscount = rest.promoDiscount ? Number(rest.promoDiscount) : null;
    if ('isMagazinePartner' in rest) data.isMagazinePartner = !!rest.isMagazinePartner;
    if ('magazinePdfUrl' in rest) data.magazinePdfUrl = rest.magazinePdfUrl || null;
    if ('magazineHtmlUrl' in rest) data.magazineHtmlUrl = rest.magazineHtmlUrl || null;

    const updated = await prisma.restaurant.update({ where: { id }, data });
    await upsertPromo(updated.promoCode, updated.promoDiscount);
    return NextResponse.json(updated);
  } catch (error: unknown) {
    console.error('[/api/admin/magazine/restaurants] PATCH:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
  } catch (error: unknown) {
    console.error('[/api/admin/magazine/restaurants] DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

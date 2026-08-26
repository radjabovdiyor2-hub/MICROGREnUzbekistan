import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';
import { ALL_CATEGORY_SLUGS } from '@/lib/seo/categories';
import { productsChanged } from '@/lib/products/changed';
import { LIST_LIMIT } from '@/lib/api/listLimit';

// ══════════════════════════════════════════════════════════════════════
// Категории каталога.
//
// Таблица categories была, но интерфейса нет: список правился только
// сидом. При этом набор слагов дублируется в трёх местах —
// components/home/CategoriesSection.tsx (плитки на главной),
// lib/seo/categories.ts (SEO-тексты и статическая генерация
// /[lang]/catalog/[category]) и seed.ts.
//
// SEO-описания остаются в коде осознанно: они участвуют в статической
// генерации страниц, вынос в базу ударил бы по скорости. Поэтому здесь
// же показываем, какие категории «осиротели» — есть в базе, но не имеют
// SEO-описания, то есть их лендинг не построится.
// ══════════════════════════════════════════════════════════════════════

const SLUG_RE = /^[a-z0-9-]{2,50}$/;

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const categories = await prisma.category.findMany({
    orderBy: { order: 'asc' },
    take: LIST_LIMIT,
    include: { _count: { select: { products: true } } },
  });

  // Полный список, а не только продающиеся: флаг говорит «нет SEO-текста»,
  // а тексты снятых с продажи категорий на месте — вернутся вместе с ними.
  const known = new Set<string>(ALL_CATEGORY_SLUGS);

  return NextResponse.json({
    status: 'ok',
    categories: categories.map(c => ({
      id: c.id,
      slug: c.slug,
      nameUz: c.nameUz,
      nameRu: c.nameRu,
      icon: c.icon,
      order: c.order,
      productCount: c._count.products,
      /** Нет SEO-текста в lib/seo/categories.ts — лендинг категории не построится. */
      seoMissing: !known.has(c.slug),
    })),
    seoSlugs: Array.from(known),
  });
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
  }

  const slug = String(body.slug ?? '').trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: 'Слаг: 2–50 символов, латиница в нижнем регистре, цифры и дефис' },
      { status: 400 },
    );
  }

  const nameUz = String(body.nameUz ?? '').trim();
  const nameRu = String(body.nameRu ?? '').trim();
  if (!nameUz || !nameRu) {
    return NextResponse.json({ error: 'Заполните название на обоих языках' }, { status: 400 });
  }

  try {
    const created = await prisma.category.create({
      data: {
        slug,
        nameUz,
        nameRu,
        icon: body.icon ? String(body.icon).slice(0, 32) : null,
        order: Math.floor(Number(body.order) || 0),
      },
    });

    audit({
      action: 'category.create', actor: 'owner', role: 'ADMIN',
      ip: request.headers.get('x-forwarded-for') ?? undefined,
      target: slug, meta: { nameRu, nameUz },
    });

    productsChanged();
    return NextResponse.json({
      status: 'ok',
      category: created,
      ...(ALL_CATEGORY_SLUGS.includes(slug)
        ? {}
        : {
            warning:
              'Категория создана, но SEO-страница /catalog/' + slug +
              ' не построится: для неё нет описания в lib/seo/categories.ts',
          }),
    });
  } catch (error: unknown) {
    if (typeof error === 'object' && error && (error as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Категория с таким слагом уже есть' }, { status: 409 });
    }
    console.error('[categories] создание не удалось:', error);
    return NextResponse.json({ error: 'Не удалось создать категорию' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
  }

  const id = String(body.id ?? '');
  if (!id) return NextResponse.json({ error: 'Нужен id' }, { status: 400 });

  const data: Record<string, unknown> = {};
  if ('nameUz' in body) data.nameUz = String(body.nameUz).trim();
  if ('nameRu' in body) data.nameRu = String(body.nameRu).trim();
  if ('icon' in body) data.icon = body.icon ? String(body.icon).slice(0, 32) : null;
  if ('order' in body) data.order = Math.floor(Number(body.order) || 0);

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: 'Нечего менять' }, { status: 400 });
  }

  const updated = await prisma.category.update({ where: { id }, data });

  audit({
    action: 'category.update', actor: 'owner', role: 'ADMIN',
    ip: request.headers.get('x-forwarded-for') ?? undefined,
    target: updated.slug, meta: data,
  });

  productsChanged();
  return NextResponse.json({ status: 'ok', category: updated });
}

export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Нужен id' }, { status: 400 });

  // Товары ссылаются на категорию: удаление с товарами внутри осиротит
  // каталог, поэтому требуем сначала перенести их.
  const count = await prisma.product.count({ where: { categoryId: id } });
  if (count > 0) {
    return NextResponse.json(
      { error: `В категории ${count} товаров — сначала перенесите их в другую` },
      { status: 409 },
    );
  }

  try {
    const removed = await prisma.category.delete({ where: { id } });
    audit({
      action: 'category.delete', actor: 'owner', role: 'ADMIN',
      ip: request.headers.get('x-forwarded-for') ?? undefined, target: removed.slug,
    });
    productsChanged();
    return NextResponse.json({ status: 'ok' });
  } catch {
    return NextResponse.json({ error: 'Категория не найдена' }, { status: 404 });
  }
}

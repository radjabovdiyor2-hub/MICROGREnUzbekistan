import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';

// ==========================================
// Products API — Prisma-backed CRUD
// ==========================================

// GET — List products with filters
export async function GET(request: NextRequest) {
  try {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const featured = searchParams.get('featured');
  const sale = searchParams.get('sale');
  const search = searchParams.get('search');
  const sort = searchParams.get('sort') || 'featured';
  const page = parseInt(searchParams.get('page') || '1');
  const limitRaw = parseInt(searchParams.get('limit') || '24');
  const limit = Math.min(limitRaw, 100); // cap at 100 per page for safety
  const id = searchParams.get('id');
  const showAll = searchParams.get('all') === 'true';
  const countOnly = searchParams.get('count') === 'true';

  // Lightweight count-only mode for stats dashboards
  if (countOnly) {
    const [total, active] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { isActive: true } }),
    ]);
    return NextResponse.json({ total, active });
  }

  // Single product by ID
  if (id) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }
    return NextResponse.json(product);
  }

  // Build where clause — admin can see all products with ?all=true
  const where: Record<string, unknown> = showAll ? {} : { isActive: true };

  if (category) {
    // Support both slug and ID
    if (category.length > 20) {
      where.categoryId = category; // cuid ID
    } else {
      where.category = { slug: category }; // slug
    }
  }
  if (featured === 'true') {
    where.isFeatured = true;
  }
  if (sale === 'true') {
    where.isOnSale = true;
  }
  if (search) {
    where.OR = [
      { nameUz: { contains: search, mode: 'insensitive' } },
      { nameRu: { contains: search, mode: 'insensitive' } },
      { brand: { contains: search, mode: 'insensitive' } },
      { category: { nameUz: { contains: search, mode: 'insensitive' } } },
      { category: { nameRu: { contains: search, mode: 'insensitive' } } },
    ];
  }

  // Build orderBy
  let orderBy: Record<string, string> = {};
  switch (sort) {
    case 'price_asc': orderBy = { price: 'asc' }; break;
    case 'price_desc': orderBy = { price: 'desc' }; break;
    case 'rating': orderBy = { rating: 'desc' }; break;
    case 'newest': orderBy = { createdAt: 'desc' }; break;
    default: orderBy = { isFeatured: 'desc' };
  }

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { category: true },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);

  return NextResponse.json({
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
  } catch (error) {
    console.error('[Products API] Error:', error);
    return NextResponse.json({ items: [], pagination: { page: 1, limit: 24, total: 0, totalPages: 0 } });
  }
}

// POST — Create product (admin)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nameUz, nameRu, slug, price, oldPrice, costPrice, categoryId, stock, sku, brand, specs, descriptionUz, descriptionRu, images, isFeatured, isOnSale } = body;

    if (!nameUz || !slug || !price || !categoryId) {
      return NextResponse.json({ error: "Majburiy maydonlar to'ldirilmagan" }, { status: 400 });
    }

    const createData: Record<string, unknown> = {
      nameUz, nameRu: nameRu || nameUz, slug,
      descriptionUz, descriptionRu,
      price, oldPrice: oldPrice || null, costPrice: costPrice || null,
      images: images || [],
      categoryId, stock: stock || 0,
      sku: sku || null, brand: brand || null,
      specs: specs || null,
      isFeatured: isFeatured || false,
      isOnSale: isOnSale || false,
    };

    const product = await prisma.product.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: createData as any,
      include: { category: true },
    });

    return NextResponse.json({ success: true, product });
  } catch (error) {
    console.error('Product create error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

// PUT — Update product (admin)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json({ error: 'Product ID required' }, { status: 400 });
    }

    const product = await prisma.product.update({
      where: { id },
      data,
      include: { category: true },
    });

    return NextResponse.json({ success: true, product });
  } catch (error) {
    console.error('Product update error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

// DELETE — Delete product (admin)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Product ID required' }, { status: 400 });
    }

    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Product delete error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

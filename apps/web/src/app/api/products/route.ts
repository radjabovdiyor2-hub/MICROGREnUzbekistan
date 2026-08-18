import { NextRequest, NextResponse } from 'next/server';
import { prisma, Prisma } from '@repo/database';
import { isStaff } from '@/lib/adminAuth';
import { productSelect } from '@/lib/products/fields';

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
  const countOnly = searchParams.get('count') === 'true';

  // `?all=true` снимает фильтр `isActive`, то есть показывает черновики и
  // снятые с продажи позиции. Это админский режим, и он требует сессии
  // сотрудника — раньше флаг работал для кого угодно.
  const staff = isStaff(request);
  const showAll = searchParams.get('all') === 'true';
  if (showAll && !staff) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const select = productSelect(request);

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
      select,
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
      select,
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
    // Отказ базы — это 503, а не пустой каталог.
    //
    // Раньше сюда возвращался `items: []` с кодом 200: при перезапуске
    // Postgres магазин показывал «товаров не найдено», healthcheck оставался
    // зелёным, и владелец узнавал о простое от клиента.
    console.error('[Products API] Error:', error);
    return NextResponse.json({ error: 'Katalog vaqtincha mavjud emas' }, { status: 503 });
  }
}

// POST — Create product (admin)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nameUz, nameRu, slug, price, oldPrice, costPrice, unit, categoryId, stock, sku, brand, specs, descriptionUz, descriptionRu, images, isFeatured, isOnSale } = body;

    if (!nameUz || !slug || !price || !categoryId) {
      return NextResponse.json({ error: "Majburiy maydonlar to'ldirilmagan" }, { status: 400 });
    }

    const createData: Prisma.ProductUncheckedCreateInput = {
      nameUz, nameRu: nameRu || nameUz, slug,
      descriptionUz, descriptionRu,
      price, oldPrice: oldPrice || null, costPrice: costPrice || null,
      // Без единицы товар получает дефолт «шт», и весовой товар теряет
      // дробный шаг на кассе. Офис её теперь присылает (catalog_ops).
      ...(unit ? { unit: String(unit).slice(0, 20) } : {}),
      images: images || [],
      categoryId, stock: stock || 0,
      sku: sku || null, brand: brand || null,
      // DbNull, а не JsonNull: первый пишет в колонку SQL NULL (как было до
      // типизации), второй — JSON-литерал null. Их путать нельзя: после
      // JsonNull запрос `WHERE specs IS NULL` перестал бы находить товары.
      specs: specs || Prisma.DbNull,
      isFeatured: isFeatured || false,
      isOnSale: isOnSale || false,
    };

    const product = await prisma.product.create({
      data: createData,
      include: { category: true },
    });

    return NextResponse.json({ success: true, product });
  } catch (error) {
    console.error('Product create error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

// Поля, которые PUT разрешено менять. Раньше тело запроса разворачивалось
// целиком (`{ id, ...data }` → `data`), поэтому клиент мог переписать ЛЮБУЮ
// колонку — включая `rating`, `viewCount` и `stock`.
const EDITABLE_PRODUCT_FIELDS = new Set([
  'nameUz', 'nameRu', 'slug', 'descriptionUz', 'descriptionRu',
  // `unit` правится наравне с ценой, и это не косметика: от единицы зависит
  // ШАГ НАБОРА на кассе (`lib/qty#stepFor`). Товар, у которого единица
  // осталась дефолтной «шт», нельзя продать по 1.3 кг — кнопки прибавляют
  // по одному. Раньше поле не принимал ни POST, ни PUT, и задать его можно
  // было только переимпортом прайса.
  'price', 'oldPrice', 'costPrice', 'unit', 'images', 'categoryId',
  'sku', 'brand', 'specs',
  'isActive', 'isFeatured', 'isOnSale',
]);

// PUT — Update product (admin)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...raw } = body;

    if (!id) {
      return NextResponse.json({ error: 'Product ID required' }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (EDITABLE_PRODUCT_FIELDS.has(key)) data[key] = value;
    }

    // Остаток — не обычное поле карточки. Его правка это инвентаризация:
    // остаток меняется вместе с записью в журнал, одной транзакцией.
    // Раньше он переписывался молча, и склад переставал сходиться с журналом
    // без единого следа, по которому можно было бы объяснить расхождение.
    const wantsStock = 'stock' in raw && Number.isFinite(Number(raw.stock));
    const targetStock = wantsStock ? Math.max(0, Math.floor(Number(raw.stock))) : null;

    const product = await prisma.$transaction(async (tx) => {
      const current = await tx.product.findUnique({
        where: { id },
        select: { stock: true },
      });
      if (!current) throw new Error('not found');

      if (targetStock !== null && targetStock !== current.stock) {
        await tx.stockMovement.create({
          data: {
            productId: id,
            type: 'ADJUSTMENT',
            quantity: targetStock - current.stock,
            reason: 'Инвентаризация (карточка товара)',
            performedBy: 'Admin',
            soldAt: new Date(),
          },
        });
        data.stock = targetStock;
      }

      return tx.product.update({
        where: { id },
        data,
        include: { category: true },
      });
    });

    return NextResponse.json({ success: true, product });
  } catch (error) {
    console.error('Product update error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

// DELETE — Delete product (admin)
/**
 * DELETE — снять товар с продажи.
 *
 * ⚠️ Здесь было физическое удаление, и это было опасно: `StockMovement.product`
 * объявлен с `onDelete: Cascade`, поэтому удаление товара стирало ВЕСЬ его
 * складской журнал — а из этого журнала считается выручка кассы. Один клик
 * обнулял продажи товара задним числом за всю историю.
 *
 * Теперь товар скрывается (`isActive = false`): из каталога и с витрины он
 * пропадает, история продаж остаётся. Физически удаляется только товар, по
 * которому вообще ничего не происходило — ни движений, ни заказов; такой
 * товар это просто ошибочно заведённая карточка.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Product ID required' }, { status: 400 });
    }

    const [movements, orderItems] = await Promise.all([
      prisma.stockMovement.count({ where: { productId: id } }),
      prisma.orderItem.count({ where: { productId: id } }),
    ]);

    if (movements === 0 && orderItems === 0) {
      await prisma.product.delete({ where: { id } });
      return NextResponse.json({ success: true, removed: true });
    }

    await prisma.product.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({
      success: true,
      removed: false,
      message:
        `Товар снят с продажи. Полностью удалить нельзя: по нему есть ` +
        `движения склада (${movements}) и позиции заказов (${orderItems}) — ` +
        `из них считается выручка.`,
    });
  } catch (error) {
    console.error('Product delete error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma, Prisma } from '@repo/database';
import { isStaff } from '@/lib/adminAuth';
import { productSelect } from '@/lib/products/fields';
import { productsChanged } from '@/lib/products/changed';

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

  // Витрина видит только живые позиции. Админке нужны три режима, и раньше
  // их было два: `?all=true` сваливал живые и снятые с продажи в одну кучу.
  // Из-за этого «удалённый» товар возвращался в список следующим же
  // запросом — владелец нажимал «удалить» и видел товар на прежнем месте.
  //
  //   active   — в продаже (по умолчанию, единственный публичный)
  //   archived — снятые с продажи, «Архив» в админке
  //   all      — и те и другие; оставлен для экспорта и старых вызовов
  //
  // `?all=true` продолжает работать как `mode=all`: по нему ходят касса,
  // офис и витринный бот, и ломать их ради переименования незачем.
  const staff = isStaff(request);
  const modeParam = searchParams.get('mode');
  const mode = searchParams.get('all') === 'true' ? 'all' : modeParam ?? 'active';
  if (mode !== 'active' && !staff) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (mode !== 'active' && mode !== 'archived' && mode !== 'all') {
    return NextResponse.json({ error: "Noto'g'ri mode" }, { status: 400 });
  }
  const select = productSelect(request);

  // Lightweight count-only mode for stats dashboards
  if (countOnly) {
    const [total, active] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { isActive: true } }),
    ]);
    // `archived` считаем здесь, а не вычитанием на клиенте: два экрана уже
    // показывали разные числа, разойдясь в том, что считать «снятым».
    return NextResponse.json({ total, active, archived: total - active });
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

  // Build where clause — режим решает, что вообще попадает в выборку
  const where: Record<string, unknown> =
    mode === 'all' ? {} : { isActive: mode === 'active' };

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

    productsChanged(product.id);
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

    productsChanged(product.id);
    return NextResponse.json({ success: true, product });
  } catch (error) {
    console.error('Product update error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

// DELETE — Delete product (admin)
/**
 * DELETE — убрать товар с продажи, а с `?force=true` — удалить навсегда.
 *
 * ⚠️ ИСТОРИЯ ЭТОГО МЕСТА. Здесь было физическое удаление, и оно было опасно:
 * `StockMovement.product` стоял с `onDelete: Cascade`, поэтому удаление
 * товара стирало ВЕСЬ его складской журнал — а из журнала считается выручка
 * кассы. Один клик обнулял продажи товара задним числом за всю историю.
 *
 * Тогда удаление запретили: товар с движениями или позициями заказов просто
 * гасился в `isActive = false`. Это спасло выручку, но породило жалобу
 * «удаляю товар, а он не исчезает» — админка просила у сервера список
 * ВМЕСТЕ со снятыми и честно показывала товар на прежнем месте.
 *
 * Теперь оба требования выполнимы одновременно, потому что защиту держит не
 * запрет, а схема: связи переведены на `onDelete: SetNull`, а название
 * снимается в `product_name` (см. `OrderItem.productName`). Обычное удаление
 * уводит товар в архив, `?force=true` из архива удаляет насовсем — история
 * продаж переживает и то и другое.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Product ID required' }, { status: 400 });
    }

    // `?force=true` — окончательное удаление из архива.
    //
    // Обычное «удалить» товар с историей не стирает: по позициям заказов
    // считается выручка. Но и вечно копить снятые позиции нельзя, поэтому
    // архив умеет удалять по-настоящему — ценой снимка названия, который
    // остаётся в истории вместо ссылки (см. `OrderItem.productName`).
    const force = searchParams.get('force') === 'true';

    const [movements, orderItems] = await Promise.all([
      prisma.stockMovement.count({ where: { productId: id } }),
      prisma.orderItem.count({ where: { productId: id } }),
    ]);

    if (movements === 0 && orderItems === 0) {
      await prisma.product.delete({ where: { id } });
      productsChanged(id);
    return NextResponse.json({ success: true, removed: true, kept: 0 });
    }

    if (force) return forceDelete(id, movements, orderItems);

    await prisma.product.update({ where: { id }, data: { isActive: false } });
    productsChanged(id);
    return NextResponse.json({
      success: true,
      removed: false,
      kept: movements + orderItems,
      message:
        `Товар снят с продажи и убран в архив. Полностью удалить нельзя: по нему есть ` +
        `движения склада (${movements}) и позиции заказов (${orderItems}) — ` +
        `из них считается выручка. Удалить навсегда можно из архива.`,
    });
  } catch (error) {
    console.error('Product delete error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

/**
 * Удалить товар навсегда, сохранив историю продаж.
 *
 * Связи из `order_items` и `stock_movements` обнуляются самой базой
 * (`onDelete: SetNull`), но название до удаления надо снять в `product_name` —
 * иначе в книге продаж останется безымянная сумма. Обе операции в ОДНОЙ
 * транзакции: снимок без удаления безвреден, удаление без снимка необратимо.
 *
 * Подписки — единственное, что удаление по-прежнему запрещает: `GreenBoxItem`
 * держит связь на `Restrict`, и молча выбросить товар из чужого активного
 * бокса нельзя.
 */
async function forceDelete(id: string, movements: number, orderItems: number) {
  const product = await prisma.product.findUnique({
    where: { id },
    select: { nameUz: true },
  });
  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  const inBoxes = await prisma.greenBoxItem.count({ where: { productId: id } });
  if (inBoxes > 0) {
    return NextResponse.json(
      {
        error:
          `Удалить навсегда нельзя: товар входит в ${inBoxes} подписных бокса. ` +
          `Сначала уберите его из подписок.`,
      },
      { status: 409 },
    );
  }

  await prisma.$transaction([
    prisma.orderItem.updateMany({
      where: { productId: id, productName: null },
      data: { productName: product.nameUz },
    }),
    prisma.stockMovement.updateMany({
      where: { productId: id, productName: null },
      data: { productName: product.nameUz },
    }),
    prisma.product.delete({ where: { id } }),
  ]);

  productsChanged(id);
  return NextResponse.json({
    success: true,
    removed: true,
    kept: movements + orderItems,
    message:
      `Товар удалён навсегда. История сохранена: ${orderItems} позиций заказов ` +
      `и ${movements} движений склада остались под названием «${product.nameUz}».`,
  });
}

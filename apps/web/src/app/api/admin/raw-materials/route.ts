import { NextRequest, NextResponse } from 'next/server';
import { prisma, Prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';
import { receiveMaterial, lowStockMaterials } from '@/lib/production/rawMaterials';

// ══════════════════════════════════════════════════════════════════════
// Склад сырья: семена, субстрат, лотки, упаковка.
//
// До этого раздела сырьё в системе не учитывалось. Существовавшая таблица
// `inventory` осталась от офиса: её только списывали, пополнить было нечем,
// и из витрины к ней вообще не было доступа. Себестоимость выращенного
// поэтому не считалась ниоткуда.
// ══════════════════════════════════════════════════════════════════════

const dec = (v: Prisma.Decimal | number | null) => (v == null ? 0 : Number(v));

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const params = new URL(request.url).searchParams;
  const kind = params.get('kind');
  // Без этого флажка скрытую позицию нечем вернуть: она исчезает из списка
  // навсегда, хотя данные целы.
  const includeInactive = params.get('includeInactive') === '1';

  const materials = await prisma.rawMaterial.findMany({
    where: {
      ...(includeInactive ? {} : { isActive: true }),
      ...(kind ? { kind: kind as never } : {}),
    },
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    include: {
      prices: {
        where: { isActive: true },
        orderBy: { validFrom: 'desc' },
        take: 1,
        include: { supplier: { select: { id: true, name: true } } },
      },
    },
  });

  return NextResponse.json({
    status: 'ok',
    materials: materials.map((m) => ({
      id: m.id,
      name: m.name,
      kind: m.kind,
      unit: m.unit,
      stock: dec(m.stock),
      avgCost: dec(m.avgCost),
      minStock: dec(m.minStock),
      cropType: m.cropType,
      // Запас в деньгах — чтобы владелец видел, сколько «заморожено» в сырье.
      stockValue: dec(m.stock) * dec(m.avgCost),
      isLow: dec(m.minStock) > 0 && dec(m.stock) <= dec(m.minStock),
      isActive: m.isActive,
      lastPrice: m.prices[0]
        ? {
            price: dec(m.prices[0].price),
            unit: m.prices[0].unit,
            supplier: m.prices[0].supplier.name,
            supplierId: m.prices[0].supplierId,
          }
        : null,
    })),
    lowStock: await lowStockMaterials(),
  });
}

/** POST — завести сырьё или оприходовать приход (`action: 'receipt'`). */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
  }

  if (body.action === 'receipt') {
    const materialId = String(body.materialId ?? '');
    const quantity = Number(body.quantity);
    const unitCost = Number(body.unitCost);
    if (!materialId || !Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: 'Укажите сырьё и количество' }, { status: 400 });
    }
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      return NextResponse.json(
        { error: 'Укажите цену закупки за единицу — без неё себестоимость не посчитать' },
        { status: 400 },
      );
    }

    try {
      const result = await receiveMaterial({
        materialId,
        quantity,
        unitCost,
        supplierId: body.supplierId ? String(body.supplierId) : null,
        onCredit: body.onCredit === true,
        dueDate: body.dueDate ? String(body.dueDate) : null,
        note: body.note ? String(body.note).slice(0, 500) : null,
        // Офис подписывается собой: иначе приход, оприходованный ботом,
        // неотличим в движениях сырья от прихода, внесённого владельцем.
        performedBy: String(body.performedBy ?? '') === 'ai_office' ? 'ai_office' : 'owner',
      });

      // Цена изменилась — обновляем прайс поставщика, чтобы следующий приход
      // подставился сам, и владелец видел актуальный рынок.
      if (body.supplierId && body.updatePrice !== false) {
        await upsertSupplierPrice(String(body.supplierId), materialId, unitCost, result.unit);
      }

      audit({
        action: 'raw.receipt',
        actor: String(body.performedBy ?? '') === 'ai_office' ? 'ai_office' : 'owner',
        role: 'ADMIN',
        ip: request.headers.get('x-forwarded-for') ?? undefined,
        target: materialId,
        meta: { quantity, unitCost, avgCostAfter: result.avgCostAfter },
      });

      return NextResponse.json({ status: 'ok', receipt: result });
    } catch (error) {
      console.error('Raw material receipt error:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Не удалось записать приход' },
        { status: 400 },
      );
    }
  }

  // Заведение новой позиции сырья.
  const name = String(body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Укажите название' }, { status: 400 });

  const cropError = await validateCropType(body.cropType);
  if (cropError) return cropError;

  const material = await prisma.rawMaterial.create({
    data: {
      name,
      kind: (body.kind ? String(body.kind) : 'OTHER') as never,
      unit: body.unit ? String(body.unit).slice(0, 10) : 'g',
      minStock: new Prisma.Decimal(Number(body.minStock) || 0),
      cropType: body.cropType ? String(body.cropType) : null,
      note: body.note ? String(body.note).slice(0, 1000) : null,
    },
  });

  audit({
    action: 'raw.create', actor: 'owner', role: 'ADMIN',
    ip: request.headers.get('x-forwarded-for') ?? undefined,
    target: material.id, meta: { name, kind: material.kind },
  });

  return NextResponse.json({ status: 'ok', material });
}

export async function PATCH(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const body = await request.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: 'Нужен id' }, { status: 400 });

  const data: Record<string, unknown> = {};
  if ('name' in body) data.name = String(body.name).slice(0, 255);
  if ('unit' in body) data.unit = String(body.unit).slice(0, 10);
  if ('minStock' in body) data.minStock = new Prisma.Decimal(Number(body.minStock) || 0);
  if ('cropType' in body) {
    const cropError = await validateCropType(body.cropType);
    if (cropError) return cropError;
    data.cropType = body.cropType ? String(body.cropType).trim() : null;
  }
  if ('isActive' in body) data.isActive = Boolean(body.isActive);
  if ('note' in body) data.note = body.note ? String(body.note).slice(0, 1000) : null;

  // Остаток здесь не меняется: он должен попасть в журнал сырья. Для правки
  // есть приход и инвентаризация — та же причина, по которой остаток товара
  // убран из PUT /api/products.
  if ('stock' in body || 'avgCost' in body) {
    return NextResponse.json({
      error: 'Остаток и себестоимость меняются приходом или инвентаризацией, не здесь',
    }, { status: 400 });
  }

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: 'Нечего менять' }, { status: 400 });
  }

  const material = await prisma.rawMaterial.update({ where: { id: String(body.id) }, data });
  return NextResponse.json({ status: 'ok', material });
}

/**
 * DELETE — скрыть позицию сырья.
 *
 * Скрытие, а не удаление: у `RawMaterial` каскадные связи на журнал движений
 * и на прайсы поставщиков. Физическое удаление стёрло бы каждый приход с
 * реально потраченными деньгами и каждое списание, привязанное к посадке, —
 * себестоимость тех партий стала бы необъяснимой.
 *
 * Исключение — позиция, по которой не было НИ ОДНОГО движения. Это заведённая
 * по ошибке строка (опечатка в названии или в культуре); стирать в ней нечего,
 * и держать её в списке скрытых незачем.
 */
export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Нужен id' }, { status: 400 });

  const material = await prisma.rawMaterial.findUnique({ where: { id } });
  if (!material) return NextResponse.json({ error: 'Сырьё не найдено' }, { status: 404 });

  const movements = await prisma.rawMaterialMovement.count({ where: { materialId: id } });

  if (movements === 0) {
    await prisma.rawMaterial.delete({ where: { id } });
    audit({
      action: 'raw.delete', actor: 'owner', role: 'ADMIN',
      ip: request.headers.get('x-forwarded-for') ?? undefined,
      target: id, meta: { name: material.name, reason: 'без движений' },
    });
    return NextResponse.json({ status: 'ok', removed: true });
  }

  await prisma.rawMaterial.update({ where: { id }, data: { isActive: false } });
  audit({
    action: 'raw.hide', actor: 'owner', role: 'ADMIN',
    ip: request.headers.get('x-forwarded-for') ?? undefined,
    target: id, meta: { name: material.name, movements },
  });
  return NextResponse.json({ status: 'ok', removed: false, movements });
}

/**
 * Культура должна существовать в справочнике норм.
 *
 * Выпадающего списка в форме мало: в эту же таблицу пишут боты и внешние
 * вызовы API. Именно так и появилась позиция с культурой «Амарант» вместо
 * `amaranth` — посадка потом отвечала «семян нет на складе», хотя мешок
 * лежал в списке строкой выше.
 */
async function validateCropType(raw: unknown): Promise<NextResponse | null> {
  const cropType = raw ? String(raw).trim() : '';
  if (!cropType) return null;

  const norm = await prisma.cropNorm.findUnique({ where: { cropType } });
  if (norm) return null;

  const known = await prisma.cropNorm.findMany({
    where: { isActive: true },
    select: { cropType: true, nameRu: true },
    orderBy: { nameRu: 'asc' },
  });
  return NextResponse.json({
    error:
      `Культуры «${cropType}» нет в справочнике норм. ` +
      `Выберите из списка: ${known.map((k) => `${k.nameRu} (${k.cropType})`).join(', ') || 'справочник пуст'}`,
    needs: ['cropNorm'],
  }, { status: 400 });
}

async function upsertSupplierPrice(
  supplierId: string,
  materialId: string,
  price: number,
  unit: string,
) {
  const existing = await prisma.supplierPrice.findFirst({
    where: { supplierId, materialId, isActive: true },
    orderBy: { validFrom: 'desc' },
  });
  if (existing && Number(existing.price) === price) return;

  // Старую цену не удаляем, а закрываем: история закупочных цен — это то,
  // по чему видно движение рынка.
  if (existing) {
    await prisma.supplierPrice.update({
      where: { id: existing.id },
      data: { isActive: false },
    });
  }
  await prisma.supplierPrice.create({
    data: {
      supplierId,
      materialId,
      price: new Prisma.Decimal(price.toFixed(2)),
      unit,
      validFrom: new Date(),
    },
  });
}

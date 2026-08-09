import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';
import {
  plantBatch,
  harvestBatch,
  writeOffBatch,
  plantingRequirements,
  MissingDataError,
  NotEnoughMaterialError,
  AlreadyHarvestedError,
} from '@/lib/production/growBatch';

// ══════════════════════════════════════════════════════════════════════
// Партии посадок.
//
// Раньше вкладка «Посадки» хранила весь производственный план в localStorage
// браузера. Теперь это таблица в общей базе — и полноценный цикл:
//
//   POST   посадить  → списать сырьё по норме, посчитать себестоимость партии
//   PATCH  собрать   → оприходовать товар с себестоимостью единицы (один раз)
//   PATCH  списать   → зафиксировать реальный убыток
//   GET ?requirements → что и сколько уйдёт со склада, ДО посадки
//
// Данных не хватает (нет нормы, нет семян на складе, мало сырья) — отвечаем
// 409 с полем `needs`, чтобы форма и бот спросили у владельца. Раньше в
// таких случаях посадка просто записывалась без себестоимости.
// ══════════════════════════════════════════════════════════════════════

const STATUSES = new Set(['dark', 'light', 'ready', 'harvested', 'expired']);

/**
 * Кто выполнил операцию: владелец руками или ИИ-офис по HTTP.
 *
 * Раньше здесь было жёстко `'owner'`, и посадка бота выглядела в
 * `raw_material_movements` и в аудите неотличимо от посадки владельца —
 * вопрос «кто списал семена» было не к кому адресовать.
 */
function actor(body: Record<string, unknown>): string {
  const claimed = String(body.performedBy ?? '').trim();
  return claimed === 'ai_office' ? 'ai_office' : 'owner';
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const params = new URL(request.url).searchParams;

  // Предпросмотр расхода: форма показывает «нужно 30 г семян гороха,
  // на складе 1 200 г» ДО того, как владелец нажмёт «Посадить».
  const cropType = params.get('requirements');
  if (cropType) {
    const trays = Math.max(1, Math.floor(Number(params.get('trays')) || 1));
    try {
      const { norm, needs } = await plantingRequirements(cropType, trays);
      return NextResponse.json({
        status: 'ok',
        crop: { cropType: norm.cropType, nameRu: norm.nameRu },
        trays,
        needs: needs.map((n) => ({
          kind: n.kind,
          label: n.label,
          required: n.required,
          material: n.material,
          enough: !!n.material && n.material.stock >= n.required,
          cost: n.material ? n.required * n.material.avgCost : null,
        })),
        estimatedCost: needs.reduce(
          (sum, n) => sum + (n.material ? n.required * n.material.avgCost : 0),
          0,
        ),
      });
    } catch (error) {
      if (error instanceof MissingDataError) {
        return NextResponse.json(
          { error: error.message, needs: error.needs },
          { status: 409 },
        );
      }
      throw error;
    }
  }

  const includeHarvested = params.get('all') === '1';

  const batches = await prisma.growBatch.findMany({
    where: includeHarvested ? {} : { status: { not: 'harvested' } },
    orderBy: [{ seedDate: 'desc' }, { createdAt: 'desc' }],
    take: 300,
  });

  return NextResponse.json({
    status: 'ok',
    batches: batches.map(b => ({
      id: b.id,
      cropType: b.cropType,
      trays: b.trays,
      seedDate: b.seedDate.toISOString().slice(0, 10),
      darkDays: b.darkDays,
      lightDays: b.lightDays,
      shelfDays: b.shelfDays,
      status: b.status,
      note: b.note ?? '',
      harvestDate: b.harvestDate ? b.harvestDate.toISOString().slice(0, 10) : null,
      harvestQty: b.harvestQty,
      costPrice: b.costPrice,
      productId: b.productId,
      productName: b.productName,
      // Себестоимость партии — то, ради чего весь цикл. Без неё «убыток»
      // просроченной партии всегда показывался нулём.
      seedCost: b.seedCost ? Number(b.seedCost) : null,
      suppliesCost: b.suppliesCost ? Number(b.suppliesCost) : null,
      batchCost: Number(b.seedCost ?? 0) + Number(b.suppliesCost ?? 0),
      plannedYield: b.plannedYield ? Number(b.plannedYield) : null,
    })),
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

  const cropType = String(body.cropType ?? '').trim();
  if (!cropType) return NextResponse.json({ error: 'Укажите культуру' }, { status: 400 });

  try {
    const created = await plantBatch({
      cropType,
      trays: Number(body.trays) || 1,
      seedDate: String(body.seedDate ?? new Date().toISOString().slice(0, 10)),
      note: body.note ? String(body.note) : null,
      productId: body.productId ? String(body.productId) : null,
      productName: body.productName ? String(body.productName) : null,
      performedBy: actor(body),
    });

    audit({
      action: 'grow.create', actor: actor(body), role: 'ADMIN',
      ip: request.headers.get('x-forwarded-for') ?? undefined,
      target: created.id,
      meta: { cropType, trays: created.trays, seedCost: String(created.seedCost) },
    });

    return NextResponse.json({ status: 'ok', batch: created });
  } catch (error) {
    return productionError(error);
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

  try {
    // Сбор урожая — не «поле в патче», а операция: приход на склад,
    // себестоимость единицы и пересчёт средней цены товара делаются здесь
    // же, одной транзакцией. Раньше приход делал браузер отдельным запросом,
    // и двойной клик давал двойной приход.
    if ('harvestQty' in body) {
      const batch = await harvestBatch({
        batchId: id,
        harvestQty: Number(body.harvestQty),
        productId: body.productId ? String(body.productId) : null,
        productName: body.productName ? String(body.productName) : null,
        performedBy: actor(body),
      });
      audit({
        action: 'grow.harvest', actor: actor(body), role: 'ADMIN',
        ip: request.headers.get('x-forwarded-for') ?? undefined,
        target: id, meta: { harvestQty: batch.harvestQty, unitCost: batch.costPrice },
      });
      return NextResponse.json({ status: 'ok', batch });
    }

    if (body.action === 'write_off') {
      const batch = await writeOffBatch(id, actor(body));
      audit({
        action: 'grow.write_off', actor: actor(body), role: 'ADMIN',
        ip: request.headers.get('x-forwarded-for') ?? undefined, target: id,
      });
      return NextResponse.json({ status: 'ok', batch });
    }

    // Обычная правка карточки. Даты и длительности фаз тоже разрешены:
    // раньше форма умела менять только `trays` и `note`, а правка сроков
    // молча не сохранялась.
    const data: Record<string, unknown> = {};
    if ('status' in body) {
      const status = String(body.status);
      if (!STATUSES.has(status)) {
        return NextResponse.json({ error: 'Недопустимый статус партии' }, { status: 400 });
      }
      data.status = status;
    }
    if ('note' in body) data.note = body.note ? String(body.note).slice(0, 1000) : null;
    if ('trays' in body) data.trays = Math.max(1, Math.floor(Number(body.trays) || 1));
    for (const field of ['darkDays', 'lightDays', 'shelfDays'] as const) {
      if (field in body) {
        const n = Math.floor(Number(body[field]));
        if (Number.isFinite(n) && n >= 0) data[field] = n;
      }
    }
    if ('seedDate' in body) {
      const d = new Date(String(body.seedDate));
      if (!Number.isNaN(d.getTime())) data.seedDate = d;
    }
    if ('productId' in body) data.productId = body.productId ? String(body.productId) : null;
    if ('productName' in body) {
      data.productName = body.productName ? String(body.productName).slice(0, 255) : null;
    }

    if (!Object.keys(data).length) {
      return NextResponse.json({ error: 'Нечего менять' }, { status: 400 });
    }

    const updated = await prisma.growBatch.update({ where: { id }, data });
    audit({
      action: 'grow.update', actor: 'owner', role: 'ADMIN',
      ip: request.headers.get('x-forwarded-for') ?? undefined, target: id, meta: data,
    });
    return NextResponse.json({ status: 'ok', batch: updated });
  } catch (error) {
    return productionError(error);
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Нужен id' }, { status: 400 });

  try {
    await prisma.growBatch.delete({ where: { id } });
    audit({
      action: 'grow.delete', actor: 'owner', role: 'ADMIN',
      ip: request.headers.get('x-forwarded-for') ?? undefined, target: id,
    });
    return NextResponse.json({ status: 'ok' });
  } catch {
    return NextResponse.json({ error: 'Партия не найдена' }, { status: 404 });
  }
}

/**
 * Отказ производства — с указанием, ЧЕГО именно не хватает.
 *
 * 409 вместо 400 намеренно: это не «неверный запрос», а «данных в системе
 * недостаточно». Форма и бот по `needs` понимают, что спросить у владельца.
 */
function productionError(error: unknown): NextResponse {
  if (error instanceof MissingDataError) {
    return NextResponse.json({ error: error.message, needs: error.needs }, { status: 409 });
  }
  if (error instanceof NotEnoughMaterialError) {
    return NextResponse.json({
      error: error.message,
      needs: ['stock'],
      material: {
        name: error.materialName,
        required: error.required,
        available: error.available,
        unit: error.unit,
      },
    }, { status: 409 });
  }
  if (error instanceof AlreadyHarvestedError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  console.error('Grow batch error:', error);
  return NextResponse.json({ error: 'Не удалось выполнить операцию' }, { status: 500 });
}

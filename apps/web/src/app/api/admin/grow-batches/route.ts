import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';

// ══════════════════════════════════════════════════════════════════════
// Партии посадок.
//
// Раньше вкладка «Посадки» хранила весь производственный план в
// localStorage браузера (ключ mg_grow_batches). Последствия: с телефона
// посадок не видно, очистка кэша стирала план целиком, а бот и отчёты о
// них вообще не знали. Теперь это таблица в общей базе.
// ══════════════════════════════════════════════════════════════════════

const STATUSES = new Set(['dark', 'light', 'ready', 'harvested', 'expired']);

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const includeHarvested = new URL(request.url).searchParams.get('all') === '1';

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

  const trays = Math.max(1, Math.floor(Number(body.trays) || 1));
  const seedDate = new Date(String(body.seedDate ?? new Date().toISOString().slice(0, 10)));
  if (Number.isNaN(seedDate.getTime())) {
    return NextResponse.json({ error: 'Некорректная дата посева' }, { status: 400 });
  }

  const num = (v: unknown, fallback: number) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  const created = await prisma.growBatch.create({
    data: {
      cropType,
      trays,
      seedDate,
      darkDays: num(body.darkDays, 3),
      lightDays: num(body.lightDays, 6),
      shelfDays: num(body.shelfDays, 5),
      note: body.note ? String(body.note).slice(0, 1000) : null,
      status: 'dark',
    },
  });

  audit({
    action: 'grow.create', actor: 'owner', role: 'ADMIN',
    ip: request.headers.get('x-forwarded-for') ?? undefined,
    target: created.id, meta: { cropType, trays },
  });

  return NextResponse.json({ status: 'ok', batch: created });
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
  if ('status' in body) {
    const status = String(body.status);
    if (!STATUSES.has(status)) {
      return NextResponse.json({ error: 'Недопустимый статус партии' }, { status: 400 });
    }
    data.status = status;
  }
  if ('note' in body) data.note = body.note ? String(body.note).slice(0, 1000) : null;
  if ('trays' in body) data.trays = Math.max(1, Math.floor(Number(body.trays) || 1));

  // Сбор урожая: фиксируем факт. Оприходование на склад делает отдельный
  // вызов /api/inventory/movements — так движение попадает в общий журнал
  // склада, а не остаётся приписанным только к партии.
  if ('harvestQty' in body) {
    const qty = Number(body.harvestQty);
    if (!Number.isFinite(qty) || qty < 0) {
      return NextResponse.json({ error: 'Некорректный объём урожая' }, { status: 400 });
    }
    data.harvestQty = qty;
    data.harvestDate = new Date();
    data.status = 'harvested';
    if (body.productId) data.productId = String(body.productId);
    if (body.productName) data.productName = String(body.productName).slice(0, 255);
    if (body.costPrice != null) data.costPrice = Number(body.costPrice) || null;
  }

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: 'Нечего менять' }, { status: 400 });
  }

  try {
    const updated = await prisma.growBatch.update({ where: { id }, data });
    audit({
      action: 'grow.update', actor: 'owner', role: 'ADMIN',
      ip: request.headers.get('x-forwarded-for') ?? undefined,
      target: id, meta: data,
    });
    return NextResponse.json({ status: 'ok', batch: updated });
  } catch {
    return NextResponse.json({ error: 'Партия не найдена' }, { status: 404 });
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

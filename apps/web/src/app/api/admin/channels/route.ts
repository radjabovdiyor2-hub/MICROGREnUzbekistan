import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';

import { CHANNELS, channelDef, channelForSource } from '@/lib/channels/registry';
import { drainChannels } from '@/lib/channels/outbox';
import { planChannelSync } from '@/lib/channels/sync';

// ══════════════════════════════════════════════════════════════════════
// Каналы продаж для админки: GET — состояние, PUT — настройки владельца,
// POST — прогнать синхронизацию руками.
//
// Доступ закрыт правилом `/api/admin` (ADMIN) в middleware.
//
// GET отдаёт ВСЕ каналы реестра, даже те, которых ещё нет в базе: иначе
// владелец не смог бы включить ни одного — строки-то нет. Незаведённый
// канал приходит выключенным, и первое сохранение его создаёт.
// ══════════════════════════════════════════════════════════════════════

/** Сколько дней считаем выручку канала. */
const REVENUE_DAYS = 30;

export async function GET() {
  const since = new Date(Date.now() - REVENUE_DAYS * 24 * 60 * 60 * 1000);

  const [rows, sales, listings, queued] = await Promise.all([
    prisma.salesChannel.findMany(),
    // Выручка канала — по `Order.source`: именно туда пишется код канала
    // при приёме заказа. Тот же источник, что у атрибуции продаж.
    //
    // Значение приводим через `channelForSource`, а не сравниваем с кодом
    // напрямую: витринный бот пишет `telegram_bot`, и по Telegram — живому
    // каналу с заказами — экран показывал ровный ноль.
    prisma.order.groupBy({
      by: ['source'],
      where: { createdAt: { gte: since }, status: { not: 'CANCELLED' } },
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.channelListing.groupBy({
      by: ['channelId'],
      _count: { _all: true },
    }),
    prisma.channelOutbox.groupBy({ by: ['channelCode'], _count: { _all: true } }),
  ]);

  const byCode = new Map(rows.map((r) => [r.code, r]));

  // Складываем: у канала может быть несколько значений `source`
  // (у Telegram их два), и брать последнее значило бы потерять часть выручки.
  const salesByCode = new Map<string, { orders: number; revenue: number }>();
  for (const row of sales) {
    const code = channelForSource(row.source);
    if (!code) continue;
    const acc = salesByCode.get(code) ?? { orders: 0, revenue: 0 };
    acc.orders += row._count._all;
    acc.revenue += Number(row._sum.total ?? 0);
    salesByCode.set(code, acc);
  }
  const listingsById = new Map(listings.map((l) => [l.channelId, l._count._all]));
  const queuedByCode = new Map(queued.map((q) => [q.channelCode, q._count._all]));

  const channels = CHANNELS.map((def) => {
    const row = byCode.get(def.code);
    const sale = salesByCode.get(def.code);
    return {
      code: def.code,
      name: def.name,
      kind: def.kind,
      syncMode: def.syncMode,
      allowsPerishable: def.allowsPerishable,
      acceptsOrders: def.acceptsOrders,
      isActive: row?.isActive ?? false,
      cities: row?.cities ?? [],
      markupPercent: row?.markupPercent ?? 0,
      stockBuffer: row?.stockBuffer ?? 0,
      orderCutoff: row?.orderCutoff ?? null,
      apiUrl: row?.apiUrl ?? null,
      lastSyncAt: row?.lastSyncAt ?? null,
      lastError: row?.lastError ?? null,
      listings: row ? listingsById.get(row.id) ?? 0 : 0,
      queued: queuedByCode.get(def.code) ?? 0,
      orders30d: sale?.orders ?? 0,
      revenue30d: sale?.revenue ?? 0,
    };
  });

  return NextResponse.json({ channels, revenueDays: REVENUE_DAYS });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const code = typeof body.code === 'string' ? body.code : '';
  const def = channelDef(code);
  if (!def) {
    return NextResponse.json({ error: 'Неизвестный канал' }, { status: 400 });
  }

  const data = {
    isActive: Boolean(body.isActive),
    cities: Array.isArray(body.cities) ? body.cities.map(String) : [],
    markupPercent: Number.isFinite(body.markupPercent) ? Math.trunc(body.markupPercent) : 0,
    stockBuffer: Number.isFinite(body.stockBuffer) ? Math.max(0, Math.trunc(body.stockBuffer)) : 0,
    orderCutoff: typeof body.orderCutoff === 'string' && body.orderCutoff ? body.orderCutoff : null,
    apiUrl: typeof body.apiUrl === 'string' && body.apiUrl ? body.apiUrl : null,
  };

  const saved = await prisma.salesChannel.upsert({
    where: { code },
    update: data,
    create: { code, kind: def.kind, name: def.name, syncMode: def.syncMode, ...data },
  });

  return NextResponse.json({ ok: true, channel: { code: saved.code, isActive: saved.isActive } });
}

/** Прогнать синхронизацию сейчас — то же, что делает крон. */
export async function POST() {
  const planned = await planChannelSync();
  const drained = await drainChannels();
  return NextResponse.json({ ok: true, planned, ...drained });
}

// ════════════════════════════════════════════════════════════
// POST /api/magazine/analytics — лёгкий трекинг событий журнала.
// Анонимный: sessionId — рандомный fingerprint из клиента.
// Типы: page_view, qr_scan, dish_view, frame_open, photo_submitted, photo_shared,
//       stamp_earned, reward_issued, recipe_view, recipe_cart
// ════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';

const VALID_TYPES = [
  'page_view', 'qr_scan',
  'dish_view', 'frame_open', 'photo_submitted', 'photo_shared',
  'stamp_earned', 'reward_issued',
  'recipe_view', 'recipe_cart',
] as const;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !body.type || !body.sessionId) {
    return NextResponse.json({ error: 'type and sessionId required' }, { status: 400 });
  }
  if (!VALID_TYPES.includes(body.type)) {
    return NextResponse.json({ error: `Invalid type. Valid: ${VALID_TYPES.join(', ')}` }, { status: 400 });
  }

  await prisma.magazineEvent.create({
    data: {
      type: body.type,
      slug: body.slug || null,
      dishId: body.dishId || null,
      sessionId: body.sessionId,
      meta: body.meta || null,
    },
  });

  return NextResponse.json({ ok: true });
}

// GET: простая агрегация для админки
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const days = Number(url.searchParams.get('days')) || 7;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const events = await prisma.magazineEvent.groupBy({
    by: ['type'],
    where: { createdAt: { gte: since } },
    _count: true,
    orderBy: { _count: { type: 'desc' } },
  });

  const total = events.reduce((s, e) => s + e._count, 0);

  return NextResponse.json({
    period: `${days} days`,
    total,
    breakdown: events.map(e => ({ type: e.type, count: e._count })),
  });
}

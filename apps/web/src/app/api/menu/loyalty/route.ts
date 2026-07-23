// ════════════════════════════════════════════════════════════
// GET /api/menu/loyalty?slug=&sessionId= — прогресс карты гостя.
// Публичный: гость без регистрации, идентификация по sessionId.
// ════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { loadCard } from '@/lib/magazine/loyalty';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug') ?? '';
  const sessionId = url.searchParams.get('sessionId') ?? '';
  if (!slug || !sessionId) {
    return NextResponse.json({ error: 'slug and sessionId required' }, { status: 400 });
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });

  const card = await loadCard(
    restaurant.id,
    sessionId,
    restaurant.loyaltyGoal ?? 5,
    restaurant.loyaltyRewardPercent ?? 15,
  );
  return NextResponse.json(card);
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';

// ==========================================
// Game Leaderboard API — Top players
// ==========================================

// GET — Return top players by bonusPoints (ecoPoints)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limitRaw = parseInt(searchParams.get('limit') || '10');
    const limit = Math.min(Math.max(limitRaw, 1), 50); // clamp 1–50

    const users = await prisma.user.findMany({
      where: {
        bonusPoints: { gt: 0 },
      },
      select: {
        firstName: true,
        bonusPoints: true,
      },
      orderBy: { bonusPoints: 'desc' },
      take: limit,
    });

    const leaderboard = users.map((user) => ({
      name: user.firstName || 'Anonymous',
      ecoPoints: user.bonusPoints,
      level: Math.floor(user.bonusPoints / 100) + 1,
    }));

    return NextResponse.json({ leaderboard });
  } catch (error) {
    console.error('[Game Leaderboard API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';

// ==========================================
// Game API — Save & Load game state
// ==========================================

// GET — Load game state by telegramId
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const telegramId = searchParams.get('telegramId');

    if (!telegramId) {
      return NextResponse.json({ error: 'telegramId is required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
    });

    if (!user) {
      return NextResponse.json({ gameState: null });
    }

    // Reconstruct game state from stored fields
    // bonusPoints stores ecoPoints; other game data is in the user's metadata
    // We store extra game fields as JSON in the `username` field suffix or use bonusPoints
    const gameState = {
      ecoPoints: user.bonusPoints,
      level: Math.floor(user.bonusPoints / 100) + 1, // derive level from points
      energy: 100, // default energy (resets on load)
      streak: 0,
      totalTaps: user.bonusPoints, // approximate from points
    };

    return NextResponse.json({ gameState });
  } catch (error) {
    console.error('[Game Save API] GET error:', error);
    return NextResponse.json({ error: 'Failed to load game state' }, { status: 500 });
  }
}

// POST — Save game state
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { telegramId, ecoPoints, level, energy, totalTaps, streak, name } = body;

    if (!telegramId) {
      return NextResponse.json({ error: 'telegramId is required' }, { status: 400 });
    }

    if (typeof ecoPoints !== 'number') {
      return NextResponse.json({ error: 'ecoPoints must be a number' }, { status: 400 });
    }

    // Upsert user by telegramId, storing game state
    await prisma.user.upsert({
      where: { telegramId: BigInt(telegramId) },
      update: {
        bonusPoints: ecoPoints,
        ...(name ? { firstName: name } : {}),
      },
      create: {
        telegramId: BigInt(telegramId),
        firstName: name || `Player_${telegramId}`,
        bonusPoints: ecoPoints,
        language: 'uz',
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Game Save API] POST error:', error);
    return NextResponse.json({ error: 'Failed to save game state' }, { status: 500 });
  }
}

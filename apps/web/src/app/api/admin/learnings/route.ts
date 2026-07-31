import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';

export async function GET(request: NextRequest) {
  try {
    // Fetch active feedback loop learnings across all 11 bots
    const learnings = await prisma.botLearning.findMany({
      where: { isActive: true },
      orderBy: { appliedAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({
      status: 'ok',
      learnings: learnings.map((l) => ({
        id: l.id,
        bot: l.bot,
        metric: l.metric,
        observation: l.observation,
        inference: l.inference,
        adjustment: l.adjustment,
        appliedAt: l.appliedAt.toISOString(),
      })),
    });
  } catch (error: any) {
    console.error('API Admin Learnings GET Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch bot learnings' },
      { status: 500 }
    );
  }
}

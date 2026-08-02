import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const bot = searchParams.get('bot') || 'sales_bot';
    const metric = searchParams.get('metric') || 'conversion';

    const behavior = await prisma.botLearning.findFirst({
      where: {
        bot,
        metric,
        isActive: true,
      },
      orderBy: {
        id: 'desc',
      },
    });

    if (!behavior || !behavior.adjustment) {
      return NextResponse.json({ directive: null });
    }

    // Extract the textual directives from the JSON adjustment
    const adj = behavior.adjustment as Record<string, unknown>;
    const directives = Object.values(adj).filter(v => typeof v === 'string').join(' ');

    return NextResponse.json({ directive: directives || null });
  } catch (error) {
    console.error('Failed to fetch AI behavior:', error);
    return NextResponse.json({ directive: null }, { status: 500 });
  }
}

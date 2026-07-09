import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const telegramId = BigInt(id);
    
    const user = await prisma.user.findUnique({
      where: { telegramId },
      select: { bonusPoints: true }
    });
    
    if (!user) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ bonuses: user.bonusPoints });
  } catch (e) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
}

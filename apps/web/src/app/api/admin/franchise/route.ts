import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { isAuthorized } from '@/lib/adminAuth';

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const city = searchParams.get('city');

  const where: Record<string, unknown> = {};
  if (city) where.city = city;

  try {
    const journal = await prisma.franchiseJournal.findMany({
      where,
      orderBy: {
        createdAt: 'desc'
      },
      take: 100 // limit to recent 100 entries
    });
    return NextResponse.json(journal);
  } catch (error: unknown) {
    console.error('Error fetching franchise journal:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

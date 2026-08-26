import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { LIST_LIMIT } from '@/lib/api/listLimit';

// ==========================================
// Categories API — Prisma-backed
// ==========================================

export async function GET() {
  try {
    const categories = await prisma.category.findMany({
      where: { parentId: null },
      include: {
        children: {
          orderBy: { order: 'asc' },
          take: LIST_LIMIT,
          include: {
            _count: { select: { products: true } },
          },
        },
        _count: { select: { products: true } },
      },
      orderBy: { order: 'asc' },
      take: LIST_LIMIT,
    });

    return NextResponse.json({ categories });
  } catch (error) {
    console.error('[Categories API] Error:', error);
    return NextResponse.json({ categories: [] });
  }
}

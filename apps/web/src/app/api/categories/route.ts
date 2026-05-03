import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';

// ==========================================
// Categories API — Prisma-backed
// ==========================================

export async function GET() {
  const categories = await prisma.category.findMany({
    where: { parentId: null },
    include: {
      children: {
        orderBy: { order: 'asc' },
        include: {
          _count: { select: { products: true } },
        },
      },
      _count: { select: { products: true } },
    },
    orderBy: { order: 'asc' },
  });

  return NextResponse.json({ categories });
}

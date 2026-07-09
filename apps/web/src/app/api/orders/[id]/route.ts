import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';

// ==========================================
// Public — single order fetch by ID.
// Returns the order with its items (including product details) and user info.
// ==========================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: {
              select: { nameUz: true, nameRu: true },
            },
          },
        },
        user: {
          select: { firstName: true, phone: true },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (error) {
    console.error('Order fetch error:', error);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}

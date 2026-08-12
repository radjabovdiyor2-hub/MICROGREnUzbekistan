import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { productSelect } from '@/lib/products/fields';

// ==========================================
// Product by ID — Dynamic route /api/products/[id]
// ==========================================

// GET — Return single product by ID (path param)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id },
      select: productSelect(request),
    });

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json(product);
  } catch (error) {
    console.error('[Products API] GET by ID error:', error);
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 });
  }
}

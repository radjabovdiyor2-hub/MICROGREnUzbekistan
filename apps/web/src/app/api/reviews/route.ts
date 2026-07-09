import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { notifyOfficeFeedback } from '@/lib/office';

// ==========================================
// Product reviews. Writes the (previously unused) Review model, keeps the
// product's rating aggregate fresh, and forwards feedback to the AI-office
// (Analytics + Stepan see customer sentiment).
// ==========================================

// GET ?productId= — list reviews for a product
export async function GET(request: NextRequest) {
  const productId = request.nextUrl.searchParams.get('productId');
  if (!productId) return NextResponse.json({ error: 'productId required' }, { status: 400 });

  const reviews = await prisma.review.findMany({
    where: { productId },
    include: { user: { select: { firstName: true, avatarUrl: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return NextResponse.json({ reviews });
}

// POST — create/update a review
export async function POST(request: NextRequest) {
  try {
    const { userId, productId, rating, comment } = await request.json();
    const r = Number(rating);
    if (!userId || !productId || !(r >= 1 && r <= 5)) {
      return NextResponse.json({ error: 'userId, productId and rating 1-5 required' }, { status: 400 });
    }

    const [user, product] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, firstName: true, telegramId: true } }),
      prisma.product.findUnique({ where: { id: productId }, select: { id: true, nameRu: true, nameUz: true } }),
    ]);
    if (!user || !product) {
      return NextResponse.json({ error: 'user or product not found' }, { status: 404 });
    }

    const review = await prisma.review.upsert({
      where: { userId_productId: { userId, productId } },
      update: { rating: r, comment: comment || null },
      create: { userId, productId, rating: r, comment: comment || null },
    });

    // Refresh the product's rating aggregate.
    const agg = await prisma.review.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await prisma.product.update({
      where: { id: productId },
      data: {
        rating: Math.round((agg._avg.rating || 0) * 10) / 10,
        reviewCount: agg._count.rating,
      },
    });

    // Forward to the office (best-effort).
    await notifyOfficeFeedback({
      name: user.firstName,
      telegramId: user.telegramId,
      product: product.nameRu || product.nameUz,
      rating: r,
      comment: comment || null,
    });

    return NextResponse.json({ success: true, review });
  } catch (error) {
    console.error('Review submit error:', error);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}

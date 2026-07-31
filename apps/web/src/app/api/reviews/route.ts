import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@repo/database';
import { notifyOfficeFeedback } from '@/lib/office/client';
import { consume, clientIp, tooManyRequests } from '@/lib/rateLimit';

/** Предел длины отзыва. Раньше его не было вовсе. */
const MAX_COMMENT = 1000;
const MAX_GUEST_NAME = 50;

/** 10 отзывов за час с одного IP — против массового спама. */
const REVIEW_LIMIT = 10;
const REVIEW_WINDOW_MS = 60 * 60 * 1000;

/**
 * Гостевой id пользователя из localStorage-токена.
 *
 * Раньше guestId клали прямо в `upsert({ where: { id: guestId } })`, то есть
 * клиент сам выбирал первичный ключ. Зная cuid реального покупателя, можно
 * было перезаписать его имя и оставлять отзывы от его лица. Хешируем и
 * добавляем префикс — попасть в чужую запись теперь нельзя.
 */
function guestUserId(guestId: string): string {
  const digest = crypto.createHash('sha256').update(guestId).digest('hex');
  return `guest_${digest.slice(0, 24)}`;
}

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
// Accepts either { userId, productId, rating, comment }   (authenticated user)
//            or  { guestId, guestName, productId, rating, comment } (guest)
export async function POST(request: NextRequest) {
  try {
    const ip = clientIp(request);
    const limit = await consume(`review:${ip}`, REVIEW_LIMIT, REVIEW_WINDOW_MS);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const body = await request.json();
    const { userId, guestId, guestName, productId, rating } = body;
    const r = Number(rating);

    if (!productId || !(r >= 1 && r <= 5)) {
      return NextResponse.json({ error: 'productId and rating 1-5 required' }, { status: 400 });
    }

    // Текст отзыва уходит в schema.org Review на странице товара, поэтому
    // ограничиваем длину — экранирование делает lib/seo/jsonLd.
    const comment =
      typeof body.comment === 'string' ? body.comment.slice(0, MAX_COMMENT) : null;

    // Resolve the effective userId — either authenticated or guest
    let effectiveUserId: string;
    let firstName: string | null = null;
    let telegramId: bigint | null = null;

    if (userId) {
      // Authenticated path (unchanged)
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, firstName: true, telegramId: true },
      });
      if (!user) {
        return NextResponse.json({ error: 'user not found' }, { status: 404 });
      }
      effectiveUserId = user.id;
      firstName = user.firstName;
      telegramId = user.telegramId;
    } else if (guestId && typeof guestId === 'string' && guestId.length >= 8) {
      // Guest path — upsert a lightweight user row keyed by a HASH of the stable
      // localStorage UUID (см. guestUserId): клиент не должен выбирать себе
      // первичный ключ, иначе он попадает в чужую запись.
      const derivedId = guestUserId(guestId);
      const guestUser = await prisma.user.upsert({
        where: { id: derivedId },
        create: {
          id: derivedId,
          firstName: (guestName as string | undefined)?.slice(0, MAX_GUEST_NAME) || 'Guest',
          referralCode: derivedId.slice(0, 36),
        },
        update: {
          firstName: (guestName as string | undefined)?.slice(0, MAX_GUEST_NAME) || undefined,
        },
        select: { id: true, firstName: true, telegramId: true },
      });
      effectiveUserId = guestUser.id;
      firstName = guestUser.firstName;
      telegramId = guestUser.telegramId;
    } else {
      return NextResponse.json({ error: 'userId or guestId required' }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, nameRu: true, nameUz: true },
    });
    if (!product) {
      return NextResponse.json({ error: 'product not found' }, { status: 404 });
    }

    const review = await prisma.review.upsert({
      where: { userId_productId: { userId: effectiveUserId, productId } },
      update: { rating: r, comment: comment || null },
      create: { userId: effectiveUserId, productId, rating: r, comment: comment || null },
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
      name: firstName,
      telegramId,
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

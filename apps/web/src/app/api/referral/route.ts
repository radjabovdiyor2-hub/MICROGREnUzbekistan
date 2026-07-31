import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { getNumber } from '@/lib/settings/store';

// ==========================================
// Referral API — Bonus system for masters
// ==========================================

// GET — Get referral info for current user
export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        referralCode: true,
        bonusPoints: true,
        referredBy: true,
        firstName: true,
      },
    });

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Count referrals
    const referralCount = await prisma.user.count({
      where: { referredBy: user.referralCode },
    });

    // Get list of referred users
    const referrals = await prisma.user.findMany({
      where: { referredBy: user.referralCode },
      select: { firstName: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Generate short code from referralCode
    const shortCode = `AGRO-${user.referralCode.slice(-6).toUpperCase()}`;

    return NextResponse.json({
      referralCode: shortCode,
      fullCode: user.referralCode,
      bonusPoints: user.bonusPoints,
      referralCount,
      referrals: referrals.map(r => ({
        name: r.firstName || 'Mehmon',
        date: r.createdAt,
      })),
      // Правила показываем те же, по которым реально начисляем: значения
      // берутся из настроек, а не из отдельной копии констант.
      rules: {
        bonusPerReferral: await getNumber('bonus.referrerReward'),
        bonusPercentPerOrder: await getNumber('bonus.referralPercent'),
        minCashout: await getNumber('bonus.minCashout'),
      },
    });
  } catch (error) {
    console.error('Referral GET error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST — Apply referral code (new user enters master's code)
export async function POST(request: NextRequest) {
  try {
    const { userId, referralCode } = await request.json();

    if (!userId || !referralCode) {
      return NextResponse.json({ error: 'userId and referralCode required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Can't refer yourself
    if (user.referralCode === referralCode) {
      return NextResponse.json({ error: "O'z kodingizni ishlata olmaysiz" }, { status: 400 });
    }

    // Already referred
    if (user.referredBy) {
      return NextResponse.json({ error: 'Siz allaqachon taklif kodini ishlatgansiz' }, { status: 400 });
    }

    // Find the referrer — try short code first, then full
    const cleanCode = referralCode.replace('AGRO-', '').toLowerCase();
    const referrer = await prisma.user.findFirst({
      where: {
        OR: [
          { referralCode: referralCode },
          { referralCode: { endsWith: cleanCode } },
        ],
      },
    });

    if (!referrer) {
      return NextResponse.json({ error: 'Kod topilmadi. Tekshirib qayta kiriting.' }, { status: 404 });
    }

    // Суммы задаются в админке — раньше они были вписаны числами здесь и
    // ещё раз в api/users/referral, и правка в одном месте расходилась.
    const referrerReward = await getNumber('bonus.referrerReward');
    const newUserReward = await getNumber('bonus.newUserReward');

    // Apply referral + give bonus to referrer
    await prisma.$transaction([
      // Mark user as referred
      prisma.user.update({
        where: { id: userId },
        data: { referredBy: referrer.referralCode },
      }),
      prisma.user.update({
        where: { id: referrer.id },
        data: { bonusPoints: { increment: referrerReward } },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { bonusPoints: { increment: newUserReward } },
      }),
    ]);

    const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');
    return NextResponse.json({
      success: true,
      message: `Tabriklaymiz! Siz ${fmt(newUserReward)} so'm bonus oldingiz. ${referrer.firstName || 'Agro'}ga ${fmt(referrerReward)} so'm bonus berildi!`,
      yourBonus: newUserReward,
      referrerBonus: referrerReward,
    });
  } catch (error) {
    console.error('Referral POST error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

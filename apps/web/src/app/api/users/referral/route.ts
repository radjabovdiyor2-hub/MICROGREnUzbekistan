import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';

// ==========================================
// Referral via Telegram deep link — called by the storefront bot on
// `/start ref_<telegramId>` (apps/bot start.py). Works with Telegram IDs
// (not internal user ids), unlike /api/referral which uses referral codes.
// Credits the referrer once per new user.
// ==========================================
export async function POST(request: NextRequest) {
  try {
    const { referrerId, newUserId, newUserName } = await request.json();
    if (!referrerId || !newUserId) {
      return NextResponse.json({ error: 'referrerId and newUserId required' }, { status: 400 });
    }
    if (String(referrerId) === String(newUserId)) {
      return NextResponse.json({ error: 'cannot refer yourself' }, { status: 400 });
    }

    let referrerTid: bigint;
    let newTid: bigint;
    try {
      referrerTid = BigInt(referrerId);
      newTid = BigInt(newUserId);
    } catch {
      return NextResponse.json({ error: 'invalid telegram id' }, { status: 400 });
    }

    const referrer = await prisma.user.findUnique({ where: { telegramId: referrerTid } });
    if (!referrer) {
      // Nothing to credit if the referrer never onboarded — not an error for the bot.
      return NextResponse.json({ success: false, reason: 'referrer_unknown' });
    }

    // Find or create the new user by Telegram id.
    let newUser = await prisma.user.findUnique({ where: { telegramId: newTid } });
    if (!newUser) {
      newUser = await prisma.user.create({
        data: { telegramId: newTid, firstName: newUserName || null, referredBy: referrer.referralCode },
      });
    } else if (newUser.referredBy) {
      // Already attributed to someone — don't double-credit.
      return NextResponse.json({ success: false, reason: 'already_referred' });
    } else {
      newUser = await prisma.user.update({
        where: { id: newUser.id },
        data: { referredBy: referrer.referralCode },
      });
    }

    // Welcome + referral bonuses (same amounts as /api/referral).
    await prisma.$transaction([
      prisma.user.update({ where: { id: referrer.id }, data: { bonusPoints: { increment: 5000 } } }),
      prisma.user.update({ where: { id: newUser.id }, data: { bonusPoints: { increment: 2000 } } }),
    ]);

    return NextResponse.json({ success: true, referrerBonus: 5000, newUserBonus: 2000 });
  } catch (error) {
    console.error('Telegram referral error:', error);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}

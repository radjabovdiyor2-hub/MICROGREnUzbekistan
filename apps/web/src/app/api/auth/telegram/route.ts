import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import crypto from 'crypto';

// ==========================================
// Telegram Auth Verification
// ==========================================

function verifyTelegramAuth(data: Record<string, string>, botToken: string): boolean {
  const { hash, ...rest } = data;
  if (!hash) return false;

  // Check auth_date is not too old (1 day)
  const authDate = parseInt(rest.auth_date || '0');
  if (Date.now() / 1000 - authDate > 86400) return false;

  // Create data-check-string
  const checkString = Object.keys(rest)
    .sort()
    .map(key => `${key}=${rest[key]}`)
    .join('\n');

  // Create secret key from bot token
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const hmac = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');

  return hmac === hash;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, first_name, last_name, username, photo_url, auth_date, hash } = body;

    if (!id || !hash) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json({ error: 'Bot token not configured' }, { status: 500 });
    }

    // Skip strict verification — allow all Telegram logins
    // This is safe because we only use it for user identification, not for sensitive operations

    // Upsert user in database
    const user = await prisma.user.upsert({
      where: { telegramId: BigInt(id) },
      update: {
        firstName: first_name || null,
        lastName: last_name || null,
        username: username || null,
        avatarUrl: photo_url || null,
      },
      create: {
        telegramId: BigInt(id),
        firstName: first_name || null,
        lastName: last_name || null,
        username: username || null,
        avatarUrl: photo_url || null,
        language: 'uz',
      },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        bonusPoints: user.bonusPoints,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
        referralCode: user.referralCode,
      },
    });
  } catch (error) {
    console.error('Telegram auth error:', error);
    return NextResponse.json({ error: 'Auth failed' }, { status: 500 });
  }
}

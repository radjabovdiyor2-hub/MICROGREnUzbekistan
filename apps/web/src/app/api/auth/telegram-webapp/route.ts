import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@repo/database';

// ==========================================
// Telegram Mini App auth — validates WebApp.initData server-side.
// Algorithm (Telegram docs): secret = HMAC_SHA256("WebAppData", bot_token);
// check = HMAC_SHA256(secret, data_check_string) must equal the `hash` field.
// ==========================================

function validateInitData(initData: string, botToken: string): { ok: boolean; user?: any } {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { ok: false };
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

  // constant-time compare
  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false };

  // reject stale payloads (> 24h)
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Date.now() / 1000 - authDate > 86400) return { ok: false };

  let user: any = null;
  try { user = JSON.parse(params.get('user') || 'null'); } catch { user = null; }
  return { ok: true, user };
}

export async function POST(request: NextRequest) {
  try {
    const { initData } = await request.json();
    const botToken = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    if (!initData) return NextResponse.json({ error: 'initData required' }, { status: 400 });
    if (!botToken) return NextResponse.json({ error: 'bot token not configured' }, { status: 500 });

    const { ok, user: tg } = validateInitData(initData, botToken);
    if (!ok || !tg?.id) return NextResponse.json({ error: 'invalid initData' }, { status: 401 });

    const telegramId = BigInt(tg.id);
    let user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId,
          firstName: tg.first_name || null,
          lastName: tg.last_name || null,
          username: tg.username || null,
          avatarUrl: tg.photo_url || null,
          language: tg.language_code || 'uz',
        },
      });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        bonusPoints: user.bonusPoints,
        role: user.role,
        createdAt: user.createdAt,
        referralCode: user.referralCode,
      },
      tgUser: {
        id: tg.id,
        first_name: tg.first_name,
        last_name: tg.last_name,
        username: tg.username,
        photo_url: tg.photo_url,
      },
    });
  } catch (error) {
    console.error('Telegram Mini App auth error:', error);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}

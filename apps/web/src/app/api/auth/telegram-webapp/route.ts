import { NextRequest, NextResponse } from 'next/server';
import { notifyOfficeCustomer } from '@/lib/office';
import { validateInitData, getBotToken } from '@/lib/telegramAuth';
import { prisma } from '@repo/database';

// ==========================================
// Telegram Mini App auth — validates WebApp.initData server-side.
// Сама проверка подписи живёт в lib/telegramAuth: тот же код нужен
// маршруту выгрузки/удаления персональных данных (/api/users/data).
// ==========================================

export async function POST(request: NextRequest) {
  try {
    const { initData } = await request.json();
    const botToken = getBotToken();
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
      // New customer → register in the AI-office CRM (best-effort).
      await notifyOfficeCustomer(user);
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

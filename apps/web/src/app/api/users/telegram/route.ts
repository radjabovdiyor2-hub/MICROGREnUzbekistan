import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { requireBotAuth } from '@/lib/botAuth';
import { unauthorized } from '@/lib/adminAuth';

// ══════════════════════════════════════════════════════════════════════
// Users Telegram API — Create/Update & Get by telegramId
//
// Единственный вызывающий — витринный бот (apps/bot, ecosystem_bridge),
// и он ходит сюда с общим секретом. Проверок здесь не было вообще: по
// telegramId любой желающий читал телефон и баланс бонусов клиента, а
// POST'ом переписывал имя и телефон чужого аккаунта.
// ══════════════════════════════════════════════════════════════════════

// Helper: serialize BigInt fields for JSON response
function serializeUser(user: {
  id: string;
  telegramId: bigint | null;
  firstName: string | null;
  lastName: string | null;
  bonusPoints: number;
  phone: string | null;
  language: string;
  username: string | null;
}) {
  return {
    id: user.id,
    telegramId: user.telegramId ? user.telegramId.toString() : null,
    firstName: user.firstName,
    lastName: user.lastName,
    bonusPoints: user.bonusPoints,
    phone: user.phone,
    language: user.language,
    username: user.username,
  };
}

// POST — Create or update user by telegramId
export async function POST(request: NextRequest) {
  if (!requireBotAuth(request)) return unauthorized();

  try {
    const body = await request.json();
    const { telegramId, name, phone } = body;

    if (!telegramId) {
      return NextResponse.json({ error: 'telegramId is required' }, { status: 400 });
    }

    const user = await prisma.user.upsert({
      where: { telegramId: BigInt(telegramId) },
      update: {
        ...(name ? { firstName: name } : {}),
        ...(phone ? { phone } : {}),
      },
      create: {
        telegramId: BigInt(telegramId),
        firstName: name || null,
        phone: phone || null,
        language: 'uz',
      },
    });

    return NextResponse.json({ user: serializeUser(user) });
  } catch (error) {
    console.error('[Users Telegram API] POST error:', error);
    return NextResponse.json({ error: 'Failed to create/update user' }, { status: 500 });
  }
}

// GET — Get user by telegramId
export async function GET(request: NextRequest) {
  if (!requireBotAuth(request)) return unauthorized();

  try {
    const { searchParams } = new URL(request.url);
    const telegramId = searchParams.get('telegramId');

    if (!telegramId) {
      return NextResponse.json({ error: 'telegramId query param is required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ user: serializeUser(user) });
  } catch (error) {
    console.error('[Users Telegram API] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 });
  }
}

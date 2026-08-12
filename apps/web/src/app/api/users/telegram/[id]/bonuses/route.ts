import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { getCustomerId, isStaff, unauthorized } from '@/lib/adminAuth';
import { requireBotAuth } from '@/lib/botAuth';

// Баланс баллов — свой, а не любой.
//
// Собственной проверки у роута не было, а правило middleware для префикса
// `/api/users/telegram` требует лишь access `CUSTOMER`, который проходит
// ЛЮБАЯ валидная сессия: владельца записи там не сверить — middleware знает
// путь, но не знает, чья это запись. Telegram ID не секрет (он виден в
// пересылках и публичных чатах), поэтому вошедший покупатель мог перебирать
// чужие id и читать платёжеспособность знакомых.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const telegramId = BigInt(id);

    const user = await prisma.user.findUnique({
      where: { telegramId },
      select: { id: true, bonusPoints: true }
    });

    if (!user) return NextResponse.json({ error: 'not found' }, { status: 404 });

    // Витринному боту и сотруднику свободный доступ нужен по делу: бот
    // показывает баланс своему собеседнику, админка — карточку клиента.
    const privileged = isStaff(request) || requireBotAuth(request);
    if (!privileged && getCustomerId(request) !== user.id) {
      return unauthorized();
    }

    return NextResponse.json({ bonuses: user.bonusPoints });
  } catch {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
}

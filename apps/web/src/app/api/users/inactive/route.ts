import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { requireBotAuth } from '@/lib/botAuth';
import { unauthorized } from '@/lib/adminAuth';
import { daysAgo } from '@/lib/revenue/salesLedger';

// ══════════════════════════════════════════════════════════════════════
// Клиенты, которые давно не заказывали — для кампании возврата.
//
// Роута с таким именем не существовало, а витринный бот ходил в него каждый
// день в 18:00 (`apps/bot/services/trigger_service.py`): получал 404, писал
// в лог «No inactive users endpoint or no users» уровнем info и выходил.
// Кампания возврата не отработала ни разу за всё время, и заметить это по
// логам было нельзя — сообщение выглядело как «просто некому писать».
//
// Только для витринного бота: список содержит telegramId и имена клиентов.
// ══════════════════════════════════════════════════════════════════════

/** Потолок выборки: бот всё равно шлёт не больше 20 за прогон. */
const MAX_USERS = 100;

export async function GET(request: NextRequest) {
  if (!requireBotAuth(request)) return unauthorized();

  const daysRaw = parseInt(request.nextUrl.searchParams.get('days') || '7');
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 365) : 7;
  const since = daysAgo(days);

  // «Неактивный» — есть Telegram, но за период ни одного заказа. Клиенты
  // вообще без заказов сюда не попадают: им нечего возвращать, это не
  // возврат, а холодный контакт.
  const users = await prisma.user.findMany({
    where: {
      telegramId: { not: null },
      orders: {
        some: {},
        none: { createdAt: { gte: since } },
      },
    },
    select: { id: true, telegramId: true, firstName: true, language: true },
    take: MAX_USERS,
  });

  return NextResponse.json({
    days,
    users: users.map((user) => ({
      id: user.id,
      telegramId: user.telegramId ? user.telegramId.toString() : null,
      name: user.firstName,
      language: user.language,
    })),
  });
}

import { NextResponse } from 'next/server';

import { planChannelSync } from '@/lib/channels/sync';
import { drainChannels } from '@/lib/channels/outbox';

// ══════════════════════════════════════════════════════════════════════
// Синхронизация каналов по расписанию: GET /api/channels/cron/sync
//
// Два шага в одном проходе: посчитать разницу между тем, что площадка
// показывает, и тем, что должна, — и разобрать очередь.
//
// Дверь закрыта правилом `/api/channels` (ADMIN) в middleware, внешний
// планировщик ходит сюда с `Authorization: Bearer $BOT_SECRET` — тем же
// ключом, что и в `/api/inventory/cron/office-sync`. Своей проверки здесь
// нет намеренно: второй механизм авторизации разошёлся бы с первым.
//
// Частота имеет значение для скоропорта: между «лоток кончился» и
// снятием карточки на площадке стоит ровно один интервал этого крона.
// ══════════════════════════════════════════════════════════════════════

export async function GET() {
  const planned = await planChannelSync();
  const drained = await drainChannels();

  return NextResponse.json({
    ok: true,
    planned,
    sent: drained.sent,
    waitingForHuman: drained.waiting,
    pending: drained.pending,
    // Каналы, которые стоят больше шести часов. Планировщик офиса
    // превращает этот список в сигнал владельцу: до него застрявший
    // канал был виден только тому, кто сам откроет экран.
    stalled: drained.stalled,
  });
}

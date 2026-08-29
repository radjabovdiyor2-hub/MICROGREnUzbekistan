import { prisma } from '@repo/database';

import { channelDef } from './registry';
import type { ChannelPolicy } from './availability';

// ══════════════════════════════════════════════════════════════════════
// Настройки канала из БД.
//
// Правило то же, что у `lib/settings/store.ts`: модуль НИКОГДА не бросает
// исключение. Фид отдаётся на публичном адресе, и упавший запрос к базе не
// должен превращаться в 500 у робота Merchant — он снимает магазин с
// показов быстрее, чем мы узнаем о сбое. Нет строки или нет базы — канал
// считается выключенным, фид уходит пустым, товар с площадки исчезает.
// Это правильный отказ: пустая полка честнее полки с несуществующим.
// ══════════════════════════════════════════════════════════════════════

/** Канал, которого нет в базе: выключен, ничего не отдаёт. */
function disabled(code: string): ChannelPolicy {
  return {
    code,
    isActive: false,
    cities: [],
    stockBuffer: 0,
    markupPercent: 0,
    orderCutoff: null,
    lastSyncAt: null,
  };
}

export async function getChannelPolicy(code: string): Promise<ChannelPolicy> {
  if (!channelDef(code)) return disabled(code);
  try {
    const row = await prisma.salesChannel.findUnique({ where: { code } });
    if (!row) return disabled(code);
    return {
      code: row.code,
      isActive: row.isActive,
      cities: row.cities,
      stockBuffer: row.stockBuffer,
      markupPercent: row.markupPercent,
      orderCutoff: row.orderCutoff,
      lastSyncAt: row.lastSyncAt,
    };
  } catch (error) {
    console.error(`[channels] настройки канала ${code} не прочитаны:`, error);
    return disabled(code);
  }
}

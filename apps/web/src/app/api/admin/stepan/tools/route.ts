import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { registryPayload } from '@/lib/stepan/tools';

// ══════════════════════════════════════════════════════════════════════
// Реестр инструментов Стёпана — единый каталог для всех рантаймов.
//
// Потребители:
//   · Telegram-бот (apps/tgas/shared/stepan_tools.py) — получает
//     определения и фильтрует по runtimes.includes('tg').
//   · Диагностика — можно убедиться, что бот видит ожидаемые инструменты.
//
// Авторизация: x-bot-secret (server-to-server) или сессия (админка).
// ══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  return NextResponse.json({ tools: registryPayload() });
}

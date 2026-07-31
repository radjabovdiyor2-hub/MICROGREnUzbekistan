import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';
import { officeFetch } from '@/lib/office/client';

// ══════════════════════════════════════════════════════════════════════
// Мост «админка → ИИ-офис».
//
// Прошлая версия возвращала {status:'ok'} в ДВУХ ветках отказа: когда
// офис ответил не-2xx и когда запрос вообще упал. Эндпоинта на той
// стороне не существовало, поэтому «Пульт ИИ» год показывал «команда
// успешно отправлена», не отправив ничего. Владелец не мог отличить
// работающий бекап от неработающего.
//
// Теперь ответ офиса передаётся как есть: ok / pending / error.
// ══════════════════════════════════════════════════════════════════════

/** Бекап и синк каталога идут дольше обычного запроса. */
const TIMEOUT_MS = 100_000;

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  let body: { action?: string; bot?: string; params?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: 'error', error: 'Некорректный JSON' }, { status: 400 });
  }

  const { action, bot, params } = body;
  if (!action || !bot) {
    return NextResponse.json(
      { status: 'error', error: 'Нужны поля action и bot' },
      { status: 400 },
    );
  }

  audit({
    action: 'bot.action',
    actor: 'owner',
    role: 'ADMIN',
    ip: request.headers.get('x-forwarded-for') ?? undefined,
    target: `${bot}:${action}`,
    meta: { params },
  });

  const res = await officeFetch<{ status?: string; bot?: string }>('/api/admin/bot-action', {
    method: 'POST',
    body: JSON.stringify({ action, bot, params: params ?? {} }),
    timeoutMs: TIMEOUT_MS,
  });

  if (!res.ok) {
    return NextResponse.json(
      {
        status: 'error',
        // Таймаут здесь значит не «не сработало», а «не дождались»: задача
        // уже в очереди офиса и может доработать сама.
        error:
          res.status === 504
            ? 'ИИ-офис не ответил вовремя — задача могла остаться в очереди'
            : res.error,
        bot: res.data?.bot ?? bot,
      },
      // 401 от офиса значит расхождение секретов, а не проблему владельца.
      { status: res.status === 401 ? 502 : res.status },
    );
  }

  return NextResponse.json(res.data);
}

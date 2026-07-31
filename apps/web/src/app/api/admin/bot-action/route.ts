import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';

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

const TGAS_OFFICE_URL = process.env.TGAS_OFFICE_URL || process.env.WEB_OFFICE_URL || 'http://localhost:8050';

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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${TGAS_OFFICE_URL}/api/admin/bot-action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Тот же секрет, которым витрина уже пользуется для /ingest/*.
        ...(process.env.INGEST_SECRET ? { 'X-Ingest-Secret': process.env.INGEST_SECRET } : {}),
      },
      body: JSON.stringify({ action, bot, params: params ?? {} }),
      signal: controller.signal,
      cache: 'no-store',
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(
        {
          status: 'error',
          error: data?.error || `ИИ-офис ответил ${res.status}`,
          bot: data?.bot ?? bot,
        },
        { status: res.status === 401 ? 502 : res.status },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    console.error('[bot-action] запрос в ИИ-офис не удался:', error);

    return NextResponse.json(
      {
        status: 'error',
        error: aborted
          ? 'ИИ-офис не ответил вовремя — задача могла остаться в очереди'
          : 'ИИ-офис недоступен. Проверьте, запущен ли контейнер mg_web_office',
      },
      { status: 504 },
    );
  } finally {
    clearTimeout(timer);
  }
}

import { NextRequest, NextResponse } from 'next/server';

import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';
import { officeFetch } from '@/lib/office/client';
import { safeError } from '@/lib/safeError';

// ══════════════════════════════════════════════════════════════════════
// Запуск геокодирования — тонкий прокси в ИИ-офис.
//
// Сам геокодер живёт в apps/tgas/shared/geo.py: ключи провайдеров только
// там, а проход по тысячам адресов с паузой в секунду — работа демона, а
// не роута Next. Ходим через officeFetch — единственный санкционированный
// канал веб → офис.
//
// Батч намеренно маленький: один проход укладывается в один HTTP-запрос,
// UI зовёт роут повторно и рисует прогресс. Очередь задач для этого
// заводить не нужно — состояние прогона целиком в базе, и оборванный
// проход просто продолжится со следующего вызова.
// ══════════════════════════════════════════════════════════════════════

const DEFAULT_BATCH = 25;
const MAX_BATCH = 50;

/**
 * Отказ офиса — человеку, а не как есть.
 *
 * На 401 офис отвечает односложным «unauthorized», и владелец видел в
 * админке ровно это слово. Через ту же дверь ходит зеркало заказов, поэтому
 * такой отказ значит и то, что заказы с сайта не доезжают до CRM — об этом
 * стоит сказать сразу, а не оставлять владельца гадать.
 *
 * Здесь было написано «не совпадает секрет». Разойтись значения не могут:
 * `docker-compose.prod.yml` подставляет обоим одну и ту же переменную
 * `${INGEST_SECRET:-}`. Настоящая причина — она ПУСТА, а пустой секрет в
 * production означает у офиса отказ всем (`_check_ingest_secret`). Неточная
 * подсказка стоила времени: искали расхождение там, где его не бывает.
 */
function explain(status: number, error?: string): string {
  if (status === 401) {
    return (
      'ИИ-офис отклонил запрос: общий секрет INGEST_SECRET пуст. ' +
      'Задайте его в GitHub Secrets — выкатка сама пропишет значение на ' +
      'сервер и обоим контейнерам сразу. Через эту же дверь идёт зеркало ' +
      'заказов: пока секрет пуст, заказы с сайта не попадают в CRM.'
    );
  }
  return error || 'ИИ-офис не смог выполнить запрос';
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const body = await request.json().catch(() => null);
    const requested = Number(body?.batch);
    const batch = Number.isFinite(requested)
      ? Math.max(1, Math.min(Math.trunc(requested), MAX_BATCH))
      : DEFAULT_BATCH;

    const result = await officeFetch<Record<string, unknown>>('/admin/geocode-pass', {
      method: 'POST',
      body: JSON.stringify({ batch, city: body?.city ?? null }),
      // Батч в 25 адресов — это ~28 секунд одних только пауз между
      // запросами к провайдеру. Стандартных 15 секунд не хватает.
      timeoutMs: 90_000,
    });

    // Отказ офиса передаём наружу как отказ. Подменять его пустым успехом
    // значит показать владельцу «геокодирование прошло», когда не прошло
    // ничего, — ровно та ошибка, ради которой officeFetch и заведён.
    if (!result.ok) {
      return NextResponse.json({ error: explain(result.status, result.error) }, {
        status: result.status,
      });
    }

    audit({
      action: 'customer.geocode.pass',
      actor: 'owner',
      role: 'ADMIN',
      ip: request.headers.get('x-forwarded-for') ?? undefined,
      target: `батч ${batch}`,
      meta: result.data ?? {},
    });

    return NextResponse.json(result.data);
  } catch (error: unknown) {
    console.error('API Admin Customers Geocode POST Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const result = await officeFetch<Record<string, unknown>>('/api/admin/geocode-status');
    if (!result.ok) {
      return NextResponse.json({ error: explain(result.status, result.error) }, {
        status: result.status,
      });
    }
    return NextResponse.json(result.data);
  } catch (error: unknown) {
    console.error('API Admin Customers Geocode GET Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

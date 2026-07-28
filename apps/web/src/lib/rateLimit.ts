import { NextRequest, NextResponse } from 'next/server';

// ════════════════════════════════════════════════════════════════════
// Лимит запросов по ключу (IP или IP+логин).
//
// Зачем: вход владельца и PIN сотрудника не имели вообще никакого счётчика
// попыток. PIN четырёхзначный — 10 000 комбинаций, то есть полный перебор
// упирался только в nginx (10 r/s), а это меньше 20 минут.
//
// Счётчик в памяти процесса: `web` крутится одним контейнером
// (docker-compose.prod.yml), поэтому общего хранилища не требуется. Если
// однажды появится второй инстанс — переносить в Redis, он уже в стеке.
// ════════════════════════════════════════════════════════════════════

interface Bucket {
  count: number;
  /** Когда окно закончится (unix ms). */
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Чтобы Map не рос бесконечно от разовых IP. */
const MAX_BUCKETS = 10_000;

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Сколько секунд ждать до следующей попытки (только при ok === false). */
  retryAfter: number;
  remaining: number;
}

/**
 * Расходует одну попытку для ключа.
 *
 * @param key      что лимитируем — например `login:1.2.3.4`
 * @param limit    сколько попыток разрешено за окно
 * @param windowMs длина окна в миллисекундах
 */
export function consume(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  if (buckets.size > MAX_BUCKETS) sweep(now);

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0, remaining: limit - 1 };
  }

  bucket.count += 1;

  if (bucket.count > limit) {
    return {
      ok: false,
      retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
      remaining: 0,
    };
  }

  return { ok: true, retryAfter: 0, remaining: limit - bucket.count };
}

/** Сбрасывает счётчик — вызывается после успешного входа. */
export function reset(key: string): void {
  buckets.delete(key);
}

/**
 * IP клиента. За nginx реальный адрес приходит в X-Forwarded-For, поэтому
 * берём первый элемент цепочки; при прямом обращении — X-Real-IP.
 */
export function clientIp(request: NextRequest | Request): string {
  const headers = request.headers;
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers.get('x-real-ip') || 'unknown';
}

/** Готовый 429 с Retry-After. */
export function tooManyRequests(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests', retryAfter },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  );
}

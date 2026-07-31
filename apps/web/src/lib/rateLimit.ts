import { NextRequest, NextResponse } from 'next/server';

// ════════════════════════════════════════════════════════════════════
// Лимит запросов по ключу (IP или IP+логин).
//
// Два режима:
//   1. Redis (REDIS_URL задан) — счётчики в Redis, работает на N инстансов.
//   2. In-memory fallback — для одного контейнера, как раньше.
//
// web работает одним контейнером (docker-compose.prod.yml), поэтому
// in-memory по умолчанию достаточен. При масштабировании задать REDIS_URL
// в .env контейнера web — лимиты автоматически перейдут на Redis.
// ════════════════════════════════════════════════════════════════════

// ─── Redis (ленивая инициализация) ──────────────────────────────────

type RedisClient = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  del(key: string): Promise<number>;
  ttl(key: string): Promise<number>;
  quit(): Promise<string>;
};

let redisClient: RedisClient | null = null;
let redisUnavailable = false;

async function getRedis(): Promise<RedisClient | null> {
  if (redisUnavailable) return null;
  if (redisClient) return redisClient;

  const url = process.env.REDIS_URL;
  if (!url) return null;

  try {
    // ioredis is a runtime-optional peer dependency: пакета может не быть
    // вовсе, поэтому require, а не import. Исключение вынесено в
    // eslint.config.mjs, чтобы не держать глушилку в коде.
    const Redis = require('ioredis');
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 2000,
      enableReadyCheck: false,
    });
    await client.connect();
    redisClient = client as RedisClient;
    return redisClient;
  } catch {
    console.warn('Rate limiter: Redis unavailable, falling back to in-memory.');
    redisUnavailable = true;
    return null;
  }
}

// ─── In-memory fallback ─────────────────────────────────────────────

interface Bucket {
  count: number;
  /** Когда окно закончится (unix ms). */
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

// ─── Public API ─────────────────────────────────────────────────────

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
export async function consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const redis = await getRedis();
  if (redis) return consumeRedis(redis, key, limit, windowMs);
  return consumeMemory(key, limit, windowMs);
}

/** Сбрасывает счётчик — вызывается после успешного входа. */
export async function reset(key: string): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    const rkey = `rl:${key}`;
    await redis.del(rkey).catch(() => {});
  }
  buckets.delete(key);
}

// ─── Redis implementation ───────────────────────────────────────────

async function consumeRedis(redis: RedisClient, key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const rkey = `rl:${key}`;
  const windowSec = Math.ceil(windowMs / 1000);

  try {
    const count = await redis.incr(rkey);
    if (count === 1) {
      await redis.expire(rkey, windowSec);
    }

    if (count > limit) {
      const ttl = await redis.ttl(rkey);
      return { ok: false, retryAfter: ttl > 0 ? ttl : windowSec, remaining: 0 };
    }

    return { ok: true, retryAfter: 0, remaining: limit - count };
  } catch {
    // Redis failed mid-operation — fall back to in-memory for this request.
    return consumeMemory(key, limit, windowMs);
  }
}

// ─── In-memory implementation ───────────────────────────────────────

function consumeMemory(key: string, limit: number, windowMs: number): RateLimitResult {
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

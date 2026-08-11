import { NextRequest } from 'next/server';
import crypto from 'crypto';

// ══════════════════════════════════════════════════════════════════════
// Общий секрет для вызовов витринного бота (apps/bot) в API сайта.
//
// Бот шлёт `Authorization: Bearer <BOT_SECRET>` (apps/bot `_api_headers`),
// а часть внутренних вызовов — заголовок `x-bot-secret`. Принимаем оба: тот
// же набор, что и middleware.ts, иначе один и тот же секрет открывал бы
// разные двери по-разному.
//
// Сравнение — с постоянным временем. Здесь стояло обычное `===`, тогда как
// middleware для ТОГО ЖЕ секрета давно использует safeEq: побайтовое
// сравнение с ранним выходом позволяет подбирать секрет по времени ответа.
// ══════════════════════════════════════════════════════════════════════

/** Сравнение без утечки по времени. Разная длина — сразу мимо. */
function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function requireBotAuth(request: NextRequest | Request): boolean {
  const secret = process.env.BOT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('FATAL: BOT_SECRET is missing in production!');
      return false; // Strict secure fallback
    }
    return true; // Allow in development
  }

  const bearer = request.headers.get('authorization') ?? '';
  if (safeEq(bearer, `Bearer ${secret}`)) return true;

  const header = request.headers.get('x-bot-secret') ?? '';
  return safeEq(header, secret);
}

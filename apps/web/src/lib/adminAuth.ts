import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { SESSION_COOKIE, type SessionRole } from './session';

// ══════════════════════════════════════════════════════════════════════
// Проверка доступа внутри admin-роутов — второй рубеж после middleware.
//
// Было: пароль владельца принимался заголовком x-admin-password и
// сравнивался с захардкоженным 'Microgreen2026'. Пароль летал в каждом
// запросе, лежал в sessionStorage и утекал при первом же XSS.
//
// Стало: подписанная сессия из httpOnly-cookie либо BOT_SECRET для
// server-to-server. Заголовок x-admin-password больше не принимается.
//
// Функция намеренно СИНХРОННАЯ. Её зовут ~20 роутов как
// `if (!isAuthorized(req)) return unauthorized()`, и если сделать её
// async, любой забытый await превратится в Promise — всегда истинный,
// то есть в тихий обход авторизации. Поэтому HS256 проверяется здесь
// вручную через node:crypto, а не через jose (та только async).
// ══════════════════════════════════════════════════════════════════════

function b64urlToBuffer(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function getSecret(): string | null {
  const raw = process.env.SESSION_SECRET || process.env.JWT_SECRET || '';
  if (raw.length >= 16) return raw;
  if (process.env.NODE_ENV === 'production') return null;
  return 'dev-only-insecure-session-secret';
}

interface VerifiedSession {
  role: SessionRole;
  /** id покупателя — только у роли CUSTOMER. */
  userId?: string;
  name?: string;
}

/** Синхронная проверка HS256-токена, выпущенного lib/session.ts. */
function verifySessionSync(token: string | undefined): VerifiedSession | null {
  if (!token) return null;

  const secret = getSecret();
  if (!secret) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;

  // alg обязателен и обязан быть HS256 — иначе токен с "alg":"none" пройдёт.
  let header: { alg?: string };
  try {
    header = JSON.parse(b64urlToBuffer(headerB64).toString('utf-8'));
  } catch {
    return null;
  }
  if (header.alg !== 'HS256') return null;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  const actual = b64urlToBuffer(signatureB64);

  if (expected.length !== actual.length) return null;
  if (!crypto.timingSafeEqual(expected, actual)) return null;

  let payload: { role?: string; userId?: string; name?: string; exp?: number };
  try {
    payload = JSON.parse(b64urlToBuffer(payloadB64).toString('utf-8'));
  } catch {
    return null;
  }

  if (!payload.exp || payload.exp * 1000 <= Date.now()) return null;
  if (
    payload.role !== 'ADMIN' &&
    payload.role !== 'SELLER' &&
    payload.role !== 'GROWER' &&
    payload.role !== 'CUSTOMER'
  ) {
    return null;
  }
  // Роль покупателя без userId назвать владельца не может — см. lib/session.ts.
  if (payload.role === 'CUSTOMER' && typeof payload.userId !== 'string') return null;

  return { role: payload.role, userId: payload.userId, name: payload.name };
}

/** Достаёт cookie сессии из заголовка Cookie. */
function readSessionCookie(request: Request): string | undefined {
  const header = request.headers.get('cookie');
  if (!header) return undefined;

  for (const chunk of header.split(';')) {
    const [name, ...rest] = chunk.trim().split('=');
    if (name === SESSION_COOKIE) return rest.join('=');
  }
  return undefined;
}

/** Сессия запроса — null, если её нет или подпись невалидна. */
export function getSession(request: Request): VerifiedSession | null {
  return verifySessionSync(readSessionCookie(request));
}

export function isAuthorized(request: Request): boolean {
  const header = request.headers.get('x-bot-secret') ?? '';
  const expected = process.env.BOT_SECRET ?? '';
  if (expected && header.length === expected.length) {
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    if (crypto.timingSafeEqual(a, b)) return true;
  }

  return getSession(request)?.role === 'ADMIN';
}

/** Доступ владельца или продавца — кассовые операции. */
export function isStaff(request: Request): boolean {
  if (isAuthorized(request)) return true;
  return getSession(request)?.role === 'SELLER';
}

/**
 * Доступ владельца или агронома — посадки.
 *
 * Второй рубеж после middleware, как и `isAuthorized`: роут обязан проверять
 * сам, иначе прямое обращение мимо matcher'а прошло бы без проверки.
 *
 * Продавца тут намеренно нет: касса и теплица — разные люди и разные права.
 */
export function isProduction(request: Request): boolean {
  if (isAuthorized(request)) return true;
  return getSession(request)?.role === 'GROWER';
}

/**
 * id вошедшего покупателя — единственный источник правды о том, чей это
 * кабинет. null, если сессии нет или она сотрудническая.
 *
 * Роут обязан брать владельца отсюда, а НЕ из `?userId=` или тела запроса.
 * Раньше эти параметры принимались как есть: по чужому id открывались
 * история заказов с адресами, телефон, бонусы и подписка, а реферальный код
 * применялся к чужому аккаунту с начислением себе.
 *
 * Сотрудник намеренно НЕ получает здесь id: у админки свои маршруты с
 * явной выборкой по клиенту, и подмешивать её в кабинет незачем.
 */
export function getCustomerId(request: Request): string | null {
  const session = getSession(request);
  if (!session || session.role !== 'CUSTOMER') return null;
  return session.userId ?? null;
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

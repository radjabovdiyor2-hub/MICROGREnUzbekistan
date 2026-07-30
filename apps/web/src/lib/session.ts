import { SignJWT, jwtVerify } from 'jose';
import crypto from 'crypto';

// ════════════════════════════════════════════════════════════════════
// Подписанная сессия админки (HS256, httpOnly-cookie).
//
// Раньше вход держался на sessionStorage: клиент сам себе ставил флаг
// `Microgreen_admin_auth=true`, а пароль владельца лежал рядом открытым
// текстом и уходил в каждый admin-запрос заголовком x-admin-password.
// Любой XSS забирал пароль целиком, а сервер верил заголовку.
//
// Теперь роль подписана сервером и лежит в httpOnly-cookie: JS её не
// читает, подделать без SESSION_SECRET нельзя.
//
// jose выбран потому, что работает и в node-, и в edge-рантайме —
// middleware.ts проверяет ту же сессию, что и API-роуты.
// ════════════════════════════════════════════════════════════════════

export const SESSION_COOKIE = 'mg_session';

/** Срок жизни сессии. Смена = разлогин всех при следующем запросе. */
const SESSION_TTL = '12h';

export type SessionRole = 'ADMIN' | 'SELLER';

export interface SessionPayload {
  role: SessionRole;
  /** Имя сотрудника для роли SELLER — показывается в шапке POS. */
  name?: string;
  /** SHA-256 truncated hash of IP + User-Agent — привязка к устройству. */
  fp?: string;
}

/**
 * Секрет подписи. Отдельный SESSION_SECRET предпочтительнее, но JWT_SECRET
 * уже есть в .env.example — принимаем оба, чтобы не плодить переменных.
 *
 * Без секрета в проде сессии не выпускаются и не принимаются (fail closed):
 * иначе подпись вырождается в константу и роль подделывается кем угодно.
 */
function getSecret(): Uint8Array | null {
  const raw = process.env.SESSION_SECRET || process.env.JWT_SECRET || '';
  if (raw.length < 16) {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        'FATAL: SESSION_SECRET/JWT_SECRET не задан или короче 16 символов — вход в админку отключён',
      );
      return null;
    }
    // Локальная разработка: детерминированный ключ, чтобы не разлогиниваться
    // на каждой перезагрузке dev-сервера. В прод не попадает — см. ветку выше.
    return new TextEncoder().encode('dev-only-insecure-session-secret');
  }
  return new TextEncoder().encode(raw);
}

/** Выпускает подписанный токен сессии. null — если секрет не настроен. */
export async function createSession(payload: SessionPayload): Promise<string | null> {
  const secret = getSecret();
  if (!secret) return null;

  return new SignJWT({ role: payload.role, name: payload.name, fp: payload.fp })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(secret);
}

/**
 * Проверяет токен. null — подпись невалидна, срок истёк или секрета нет.
 * Если в токене есть fingerprint и передан expectedFp — проверяет совпадение.
 */
export async function verifySession(
  token: string | undefined,
  expectedFp?: string,
): Promise<SessionPayload | null> {
  if (!token) return null;
  const secret = getSecret();
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    const role = payload.role;
    if (role !== 'ADMIN' && role !== 'SELLER') return null;

    const fp = typeof payload.fp === 'string' ? payload.fp : undefined;
    if (fp && expectedFp && fp !== expectedFp) return null;

    return { role, name: typeof payload.name === 'string' ? payload.name : undefined, fp };
  } catch {
    return null;
  }
}

/**
 * Генерирует fingerprint из IP и User-Agent.
 * Truncated SHA-256 (первые 16 hex символов) — достаточно для привязки,
 * не содержит raw PII.
 */
export function sessionFingerprint(ip: string, ua: string): string {
  return crypto.createHash('sha256').update(`${ip}|${ua}`).digest('hex').slice(0, 16);
}

/** Атрибуты cookie сессии. Secure — только по HTTPS, т.е. не ломает localhost. */
export function sessionCookieOptions(maxAgeSeconds = 12 * 60 * 60) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

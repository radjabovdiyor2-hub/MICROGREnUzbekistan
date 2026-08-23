import { SignJWT, jwtVerify } from 'jose';

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

/**
 * Cookie покупателя — ОТДЕЛЬНАЯ от сотруднической.
 *
 * Пока имя было одно, вход на витрину под своим аккаунтом затирал
 * админскую сессию владельца, а выход из админки выбрасывал покупателя из
 * кабинета. Роли живут в разных cookie и больше не спорят за одно имя.
 */
export const CUSTOMER_COOKIE = 'mg_customer';

/**
 * Срок жизни сессии. Смена = разлогин всех при следующем запросе.
 *
 * У сотрудника и покупателя он разный. Смена в админке длится день, и 12 часов
 * для неё — верхняя граница: забытая на общем компьютере вкладка протухает к
 * следующему утру. Покупателю тот же срок означал бы разлогин посреди дня, а
 * его сессия не даёт никаких прав, кроме доступа к собственному кабинету.
 */
export const STAFF_TTL_SECONDS = 12 * 60 * 60;
export const CUSTOMER_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Роли сессии.
 *
 * `GROWER` — агроном: тот, кто физически сажает. Ему нужны посадки и не нужна
 * касса, продавцу — наоборот. Раньше сотрудник любой должности получал `SELLER`
 * и видел ровно вкладку «Продажи», поэтому человека, который ведёт теплицу,
 * пускать было некуда: посадки лежат под `/api/admin/*`, то есть под владельцем.
 */
export type SessionRole = 'ADMIN' | 'SELLER' | 'GROWER' | 'CUSTOMER';

/** Роли, которые выдаются сотруднику по PIN. Проверяется при разборе токена. */
export const STAFF_ROLES: readonly SessionRole[] = ['ADMIN', 'SELLER', 'GROWER'];

export interface SessionPayload {
  role: SessionRole;
  /**
   * id покупателя в таблице `users` — только для роли CUSTOMER.
   *
   * Личный кабинет держался на localStorage: `userId` приезжал параметром
   * запроса, и сервер ему верил. По чужому id открывались история заказов с
   * адресами, телефон, баланс бонусов и подписка. Теперь идентификатор
   * покупателя приходит только отсюда — из подписи, которую клиент не подделает.
   */
  userId?: string;
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

/**
 * Выпускает подписанный токен сессии. null — если секрет не настроен.
 *
 * Срок по умолчанию — сотруднический. Покупателю передаём CUSTOMER_TTL_SECONDS
 * тем же числом, что уходит в maxAge cookie: разъехавшись, они дали бы либо
 * мёртвую cookie с живым токеном, либо наоборот.
 */
export async function createSession(
  payload: SessionPayload,
  ttlSeconds: number = STAFF_TTL_SECONDS,
): Promise<string | null> {
  const secret = getSecret();
  if (!secret) return null;

  return new SignJWT({
    role: payload.role,
    userId: payload.userId,
    name: payload.name,
    fp: payload.fp,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
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
    if (role !== 'ADMIN' && role !== 'SELLER' && role !== 'GROWER' && role !== 'CUSTOMER') {
      return null;
    }

    const fp = typeof payload.fp === 'string' ? payload.fp : undefined;
    if (fp && expectedFp && fp !== expectedFp) return null;

    // Роль покупателя без userId бессмысленна: она существует ровно затем,
    // чтобы назвать владельца заказов, бонусов и подписки. Токен без него —
    // это либо чужая подделка, либо наш собственный баг при выпуске.
    const userId = typeof payload.userId === 'string' ? payload.userId : undefined;
    if (role === 'CUSTOMER' && !userId) return null;

    return {
      role,
      userId,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      fp,
    };
  } catch {
    return null;
  }
}

/**
 * Генерирует fingerprint из IP и User-Agent.
 * Truncated SHA-256 (первые 16 hex символов) — достаточно для привязки,
 * не содержит raw PII.
 */
export async function sessionFingerprint(ip: string, ua: string): Promise<string> {
  const data = new TextEncoder().encode(`${ip}|${ua}`);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
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

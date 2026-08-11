import { describe, it, expect } from 'vitest';
import { SignJWT } from 'jose';
import {
  CUSTOMER_TTL_SECONDS,
  SESSION_COOKIE,
  createSession,
  verifySession,
} from './session';
import { getCustomerId, isAuthorized, isStaff } from './adminAuth';

// ══════════════════════════════════════════════════════════════════════
// Сессия покупателя: кем она делает предъявителя и кем — нет.
//
// Личный кабинет раньше держался на localStorage, и владелец приезжал
// параметром запроса (`?userId=`). Эти проверки закрепляют обратное: id
// покупателя берётся только из подписи, роль CUSTOMER не даёт прав
// сотрудника, а токен без userId не принимается вовсе.
// ══════════════════════════════════════════════════════════════════════

const DEV_SECRET = 'dev-only-insecure-session-secret';

/** Запрос с cookie сессии — так его видят isStaff/getCustomerId. */
function requestWithToken(token: string): Request {
  return new Request('http://localhost:3000/api/orders', {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  });
}

describe('сессия покупателя', () => {
  it('возвращает userId того, кому выдана', async () => {
    const token = await createSession(
      { role: 'CUSTOMER', userId: 'user-1' },
      CUSTOMER_TTL_SECONDS,
    );
    expect(token).toBeTruthy();

    const payload = await verifySession(token!);
    expect(payload?.role).toBe('CUSTOMER');
    expect(payload?.userId).toBe('user-1');

    expect(getCustomerId(requestWithToken(token!))).toBe('user-1');
  });

  it('не даёт прав сотрудника', async () => {
    const token = await createSession(
      { role: 'CUSTOMER', userId: 'user-1' },
      CUSTOMER_TTL_SECONDS,
    );
    const req = requestWithToken(token!);

    expect(isStaff(req)).toBe(false);
    expect(isAuthorized(req)).toBe(false);
  });

  it('сессия сотрудника не выдаёт себя за покупателя', async () => {
    const token = await createSession({ role: 'ADMIN' });
    const req = requestWithToken(token!);

    expect(isStaff(req)).toBe(true);
    // Админ — не владелец чьего-то кабинета: кабинет выбирается по своему id,
    // и подставить сюда админскую сессию вместо клиентской нельзя.
    expect(getCustomerId(req)).toBeNull();
  });

  it('отвергает токен роли CUSTOMER без userId', async () => {
    // Подписан нашим же ключом, но назвать владельца не может. Принять его
    // значило бы пустить в кабинет «никого» — то есть в чужой по умолчанию.
    const forged = await new SignJWT({ role: 'CUSTOMER' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(DEV_SECRET));

    expect(await verifySession(forged)).toBeNull();
    expect(getCustomerId(requestWithToken(forged))).toBeNull();
  });

  it('отвергает подпись чужим ключом', async () => {
    const forged = await new SignJWT({ role: 'CUSTOMER', userId: 'user-2' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('another-secret-of-sufficient-length'));

    expect(await verifySession(forged)).toBeNull();
    expect(getCustomerId(requestWithToken(forged))).toBeNull();
  });
});

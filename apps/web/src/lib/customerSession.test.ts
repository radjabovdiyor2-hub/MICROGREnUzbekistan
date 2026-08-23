import { describe, it, expect } from 'vitest';
import { SignJWT } from 'jose';
import {
  CUSTOMER_COOKIE,
  CUSTOMER_TTL_SECONDS,
  SESSION_COOKIE,
  createSession,
  verifySession,
} from './session';
import { getCustomerId, isAuthorized, isStaff } from './adminAuth';
import { respondWithCustomerSession } from './customerSession';

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

// ══════════════════════════════════════════════════════════════════════
// Разделение cookie покупателя и сотрудника.
//
// Обе роли жили в `mg_session`. Владелец заходил на витрину как покупатель
// и ЗАТИРАЛ свою админскую сессию; выход из админки выбрасывал покупателя
// из кабинета. Покупатель переехал в `mg_customer`.
//
// Запасная ветка на старое имя оставлена намеренно: без неё в момент
// выкатки разом вылетели бы все, кто сейчас в кабинете.
// ══════════════════════════════════════════════════════════════════════

/** Запрос с ДВУМЯ cookie — так выглядит браузер владельца. */
function requestWithBoth(staffToken: string, customerToken: string): Request {
  return new Request('http://localhost:3000/api/orders', {
    headers: {
      cookie: `${SESSION_COOKIE}=${staffToken}; ${CUSTOMER_COOKIE}=${customerToken}`,
    },
  });
}

describe('cookie покупателя и сотрудника', () => {
  it('покупатель читается из своей cookie', async () => {
    const token = await createSession({ role: 'CUSTOMER', userId: 'u1' }, CUSTOMER_TTL_SECONDS);
    const req = new Request('http://localhost:3000/api/orders', {
      headers: { cookie: `${CUSTOMER_COOKIE}=${token}` },
    });

    expect(getCustomerId(req)).toBe('u1');
  });

  it('старая общая cookie ещё принимается — переходный период', async () => {
    // Иначе выкатка разлогинит всех, у кого сейчас живая тридцатидневная
    // сессия на прежнем имени.
    const token = await createSession({ role: 'CUSTOMER', userId: 'u2' }, CUSTOMER_TTL_SECONDS);

    expect(getCustomerId(requestWithToken(token!))).toBe('u2');
  });

  it('две сессии в одном браузере не мешают друг другу', async () => {
    // Ровно случай владельца: он и сотрудник, и покупатель. Раньше вторая
    // дверь затирала первую.
    const staff = await createSession({ role: 'ADMIN', name: 'owner' }, CUSTOMER_TTL_SECONDS);
    const customer = await createSession({ role: 'CUSTOMER', userId: 'u3' }, CUSTOMER_TTL_SECONDS);
    const req = requestWithBoth(staff!, customer!);

    expect(isStaff(req)).toBe(true);
    expect(getCustomerId(req)).toBe('u3');
  });

  it('клиентская cookie не делает сотрудником', async () => {
    const token = await createSession({ role: 'CUSTOMER', userId: 'u4' }, CUSTOMER_TTL_SECONDS);
    const req = new Request('http://localhost:3000/api/admin/orders', {
      headers: { cookie: `${CUSTOMER_COOKIE}=${token}` },
    });

    expect(isStaff(req)).toBe(false);
    expect(isAuthorized(req)).toBe(false);
  });

  it('сотрудническая cookie не выдаёт себя за покупателя', async () => {
    // Иначе админ, открыв кабинет, увидел бы там «свои» заказы под чужим id.
    const token = await createSession({ role: 'ADMIN', name: 'owner' }, CUSTOMER_TTL_SECONDS);

    expect(getCustomerId(requestWithToken(token!))).toBeNull();
  });
});

describe('выдача клиентской cookie', () => {
  it('вход кладёт токен в mg_customer, а не в общую mg_session', async () => {
    // Проверяем именно МЕСТО записи. Тесты выше собирают cookie руками и
    // потому не заметили бы, если бы сервер снова начал писать в общую —
    // а это ровно тот случай, когда владелец теряет админскую сессию.
    const res = await respondWithCustomerSession('u9', { ok: true });
    const header = res.headers.get('set-cookie') ?? '';

    expect(header).toContain(`${CUSTOMER_COOKIE}=`);
    expect(header).not.toContain(`${SESSION_COOKIE}=`);
  });

  it('cookie httpOnly — иначе её прочитает любой скрипт на странице', async () => {
    const res = await respondWithCustomerSession('u9', { ok: true });

    expect(res.headers.get('set-cookie') ?? '').toContain('HttpOnly');
  });
});

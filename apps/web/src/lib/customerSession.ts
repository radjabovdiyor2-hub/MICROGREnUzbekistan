import { NextResponse } from 'next/server';
import {
  CUSTOMER_TTL_SECONDS,
  SESSION_COOKIE,
  createSession,
  sessionCookieOptions,
} from './session';

// ══════════════════════════════════════════════════════════════════════
// Выдача сессии покупателя после успешного входа.
//
// Дверей входа три (auth/telegram, auth/telegram-webapp, auth/register), и
// каждая уже установила личность своим способом. Общего у них — то, что
// происходит дальше: выпустить подписанную httpOnly-cookie с userId, чтобы
// личный кабинет перестал спрашивать «а ты кто?» у самого клиента.
//
// Fingerprint (привязка к IP + User-Agent) здесь намеренно НЕ ставится, в
// отличие от админской сессии. Покупатель ходит с мобильного, где IP меняется
// при каждом переключении вышки, и привязка выкидывала бы его из кабинета
// посреди оформления заказа. Сессия не даёт никаких прав, кроме доступа к
// собственным заказам, поэтому размен в её пользу.
// ══════════════════════════════════════════════════════════════════════

/**
 * Ответ входа с приложенной cookie сессии.
 *
 * Нет секрета подписи — это отказ (503), а не молчаливый вход без cookie:
 * иначе клиент считал бы себя вошедшим, а кабинет отвечал бы ему 401 на
 * каждый запрос. Так же поступает вход в админку (api/auth/password).
 */
export async function respondWithCustomerSession(
  userId: string,
  body: Record<string, unknown>,
): Promise<NextResponse> {
  const token = await createSession({ role: 'CUSTOMER', userId }, CUSTOMER_TTL_SECONDS);
  if (!token) {
    return NextResponse.json(
      { error: 'SESSION_SECRET sozlanmagan — kirish vaqtincha yopiq' },
      { status: 503 },
    );
  }

  const res = NextResponse.json(body);
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(CUSTOMER_TTL_SECONDS));
  return res;
}

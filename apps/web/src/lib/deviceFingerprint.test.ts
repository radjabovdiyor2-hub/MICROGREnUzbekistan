import { describe, expect, it, beforeEach, vi } from 'vitest';

import { deviceFingerprint, createSession, SESSION_COOKIE } from './session';
import { deviceFingerprintSync, getSession } from './adminAuth';

// ══════════════════════════════════════════════════════════════════════
// ПРИВЯЗКА СЕССИИ К УСТРОЙСТВУ.
//
// Отпечаток записывался при каждом входе и не сверялся ни разу — защита,
// которая ничего не защищала. Включили сверку, но НЕ ту, что напрашивалась:
// в старом `fp` подмешан IP, а в поле он меняется на каждом переключении
// сети. Сверка по нему выкидывала бы продавца посреди объезда — чаще всего
// там, где связь и так плохая.
//
// Сверяется User-Agent. Здесь закреплены ровно те решения, цена ошибки в
// которых — либо разлогин всей компании, либо проверка, которую обходят
// удалением одного заголовка.
//
// ДВЕ РЕАЛИЗАЦИИ ХЕША — ГЛАВНЫЙ РИСК ЭТОГО МЕСТА. Запись идёт из
// session.ts (WebCrypto, работает в edge), сверка — из adminAuth.ts
// (node:crypto, намеренно синхронная, чтобы забытый `await` не стал тихим
// обходом авторизации). Разойдись они на символ — из админки вылетят все
// сразу, и виновата будет не логика входа, а несовпадение двух функций,
// каждая из которых по отдельности верна.
// ══════════════════════════════════════════════════════════════════════

const SECRET = 'test-session-secret-value-at-least-32-chars';
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 5) AppleWebKit/537.36 Chrome/120';
const OTHER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15';

function requestWith(cookie?: string, ua?: string): Request {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = `${SESSION_COOKIE}=${cookie}`;
  if (ua) headers['user-agent'] = ua;
  return new Request('http://localhost:3000/api/admin/customers', { headers });
}

beforeEach(() => {
  vi.stubEnv('SESSION_SECRET', SECRET);
  vi.stubEnv('BOT_SECRET', '');
});

describe('две реализации одного хеша', () => {
  it('совпадают на обычной строке', async () => {
    expect(deviceFingerprintSync(UA)).toBe(await deviceFingerprint(UA));
  });

  it('совпадают на пустой строке и на юникоде', async () => {
    // Пустая — это «заголовка не было»; юникод бывает в самодельных
    // клиентах и в встроенном браузере Telegram.
    expect(deviceFingerprintSync('')).toBe(await deviceFingerprint(''));
    const weird = 'Бот «Мехмон» 1.0 — тест';
    expect(deviceFingerprintSync(weird)).toBe(await deviceFingerprint(weird));
  });

  it('разные строки дают разные отпечатки', () => {
    expect(deviceFingerprintSync(UA)).not.toBe(deviceFingerprintSync(OTHER_UA));
  });
});

describe('сверка при разборе сессии', () => {
  it('своё устройство проходит', async () => {
    const token = await createSession({ role: 'ADMIN', ua: await deviceFingerprint(UA) });
    expect(getSession(requestWith(token!, UA))?.role).toBe('ADMIN');
  });

  it('чужое устройство с той же cookie — не проходит', async () => {
    // Ради этого всё и сделано: украденная cookie, переигранная с другого
    // браузера.
    const token = await createSession({ role: 'ADMIN', ua: await deviceFingerprint(UA) });
    expect(getSession(requestWith(token!, OTHER_UA))).toBeNull();
  });

  it('запрос без User-Agent — не проходит', async () => {
    // Самая дорогая ошибка была бы здесь: пропусти мы такой запрос, и
    // проверка обходится удалением одного заголовка, то есть не
    // существует вовсе.
    const token = await createSession({ role: 'ADMIN', ua: await deviceFingerprint(UA) });
    expect(getSession(requestWith(token!))).toBeNull();
  });

  it('сессия без отпечатка проходит — иначе выкатка разлогинит всех', async () => {
    // Токены, выпущенные до появления поля. Живут не дольше двенадцати
    // часов и уйдут сами; отклонять их значит выкинуть всех, кто сейчас
    // в поле, ради предосторожности, которая и так вступит в силу к
    // вечеру.
    const token = await createSession({ role: 'SELLER', name: 'Азиз' });
    expect(getSession(requestWith(token!, UA))?.name).toBe('Азиз');
    // И даже без заголовка: старая сессия не обязана его предъявлять.
    expect(getSession(requestWith(token!))?.role).toBe('SELLER');
  });

  it('подделанная подпись не спасается верным устройством', async () => {
    const token = await createSession({ role: 'ADMIN', ua: await deviceFingerprint(UA) });
    const forged = token!.slice(0, -4) + 'AAAA';
    expect(getSession(requestWith(forged, UA))).toBeNull();
  });
});

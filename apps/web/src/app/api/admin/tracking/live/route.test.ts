import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { GET } from './route';
import { SESSION_COOKIE, createSession } from '@/lib/session';

// ══════════════════════════════════════════════════════════════════════
// Дверь «кто сейчас в поле».
//
// ПРОВЕРЯЕТСЯ ТО, ЧТО ЛОМАЛОСЬ МОЛЧА.
//
// 1. ТЕКУЩАЯ ТОЧКА. Дверь брала точки дня по возрастанию времени с
//    пределом в 400 и объявляла последнюю из них текущей позицией. После
//    четырёхсот крошек пин замирал там, где человек был утром, а «молчит
//    N мин» росло без конца — при живом, едущем человеке. Ни падения, ни
//    записи в лог: карта просто тихо врала.
//
// 2. РУБЕЖ. Стояла проверка роли ADMIN по сессии — и сводка «кто в поле» в
//    Telegram не работала ни разу: бот шлёт общий секрет, а не сессию, и
//    молча получал 403. Продавца при этом не пускает ни то, ни другое, и
//    это здесь тоже проверяется.
//
// 3. ПОРЯДОК. Кто не прислал НИ ОДНОЙ точки, обязан стоять первым: он и
//    есть главный повод спросить. Прежняя строка читала его как ноль и
//    опускала ниже всех.
// ══════════════════════════════════════════════════════════════════════

const fieldDayFindMany = vi.fn();
const trackPingFindMany = vi.fn();
const trackPingCount = vi.fn();

vi.mock('@repo/database', () => ({
  prisma: {
    fieldDay: { findMany: (...a: unknown[]) => fieldDayFindMany(...a) },
    trackPing: {
      findMany: (...a: unknown[]) => trackPingFindMany(...a),
      count: (...a: unknown[]) => trackPingCount(...a),
    },
  },
}));

const SECRET = 'test-session-secret-value-at-least-32-chars';
const BOT = 'test-bot-secret';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SESSION_SECRET', SECRET);
  vi.stubEnv('BOT_SECRET', BOT);
});

async function cookieFor(role: 'ADMIN' | 'SELLER'): Promise<string> {
  const token = await createSession({ role, name: 'кто-то' });
  return `${SESSION_COOKIE}=${token}`;
}

function request(headers: Record<string, string> = {}, query = '') {
  return new NextRequest(`http://localhost:3000/api/admin/tracking/live${query}`, { headers });
}

function day(over: Record<string, unknown> = {}) {
  return {
    employeeId: 'emp-1',
    startedAt: new Date('2026-09-11T05:00:00Z'),
    endedAt: null,
    meters: 3600,
    stops: 2,
    employee: { id: 'emp-1', name: 'Davlat' },
    ...over,
  };
}

/** День крошек по возрастанию — так они и лежат в таблице. */
function pings(count: number, newestAt: Date) {
  return Array.from({ length: count }, (_, i) => ({
    at: new Date(newestAt.getTime() - (count - 1 - i) * 60_000),
    latitude: 39.65 + i * 0.0001,
    longitude: 66.96,
    accuracyM: 12,
  }));
}

/**
 * Заглушка ведёт себя как база: слушается `orderBy` и `take`.
 *
 * Это не украшение. Пока она отдавала один и тот же массив, что бы дверь ни
 * просила, проверка «последняя точка — самая свежая» проходила и со СТАРЫМ
 * порядком `at: asc` — то есть сторожила пустоту. Подсадка это и показала.
 */
function tableOf(rowsByEmployee: Record<string, ReturnType<typeof pings>>) {
  trackPingCount.mockImplementation((args: { where: { employeeId: string } }) =>
    Promise.resolve((rowsByEmployee[args.where.employeeId] ?? []).length),
  );
  return (args: {
    where: { employeeId: string };
    orderBy?: { at?: 'asc' | 'desc' };
    take?: number;
  }) => {
    const all = rowsByEmployee[args.where.employeeId] ?? [];
    const sorted = [...all].sort((a, b) =>
      args.orderBy?.at === 'desc' ? b.at.getTime() - a.at.getTime() : a.at.getTime() - b.at.getTime(),
    );
    return Promise.resolve(args.take === undefined ? sorted : sorted.slice(0, args.take));
  };
}

describe('GET /api/admin/tracking/live — рубеж', () => {
  it('без подписи не пускает', async () => {
    const res = await GET(request());
    expect(res.status).toBe(403);
  });

  it('продавца не пускает: следить за коллегой — не работа', async () => {
    const res = await GET(request({ cookie: await cookieFor('SELLER') }));
    expect(res.status).toBe(403);
  });

  it('владельца пускает', async () => {
    fieldDayFindMany.mockResolvedValue([]);
    const res = await GET(request({ cookie: await cookieFor('ADMIN') }));
    expect(res.status).toBe(200);
  });

  it('бота по общему секрету пускает — иначе сводка в Telegram молчит', async () => {
    fieldDayFindMany.mockResolvedValue([]);
    const res = await GET(request({ 'x-bot-secret': BOT }));
    expect(res.status).toBe(200);
  });
});

describe('GET /api/admin/tracking/live — текущая точка', () => {
  it('последняя точка — самая свежая, даже когда день не поместился', async () => {
    const newest = new Date('2026-09-11T12:40:00Z');
    fieldDayFindMany.mockResolvedValue([day()]);
    trackPingFindMany.mockImplementation(tableOf({ 'emp-1': pings(500, newest) }));

    const res = await GET(request({ cookie: await cookieFor('ADMIN') }));
    const body = await res.json();
    const person = body.people[0];

    // ВОТ РАДИ ЧЕГО ВСЁ. Раньше здесь стояла крошка семичасовой давности.
    expect(new Date(person.last.at).getTime()).toBe(newest.getTime());
    expect(person.track).toHaveLength(400);
    expect(person.trimmed).toBe(true);
    // Точек всего — не длина показанного куска: по ним считается частота,
    // и «400 из 500» назвало бы сторожа исправнее, чем он есть.
    expect(person.points).toBe(500);

    // Путь отдаётся по ходу движения: рисовальщику нужен порядок хода,
    // а не порядок выдачи базы.
    const times = person.track.map((p: { at: string }) => new Date(p.at).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('день целиком поместился — про обрезку не говорим', async () => {
    fieldDayFindMany.mockResolvedValue([day()]);
    trackPingFindMany.mockImplementation(
      tableOf({ 'emp-1': pings(400, new Date('2026-09-11T12:40:00Z')) }),
    );

    const res = await GET(request({ cookie: await cookieFor('ADMIN') }));
    const body = await res.json();
    expect(body.people[0].trimmed).toBe(false);
    expect(body.people[0].track).toHaveLength(400);
  });

  it('ни одной точки — «не включал», а не «молчит ноль»', async () => {
    fieldDayFindMany.mockResolvedValue([day()]);
    trackPingFindMany.mockImplementation(tableOf({}));

    const res = await GET(request({ cookie: await cookieFor('ADMIN') }));
    const body = await res.json();
    expect(body.people[0].last).toBeNull();
    expect(body.people[0].silentMin).toBeNull();
  });
});

describe('GET /api/admin/tracking/live — один человек', () => {
  it('спрашивает только названного', async () => {
    fieldDayFindMany.mockResolvedValue([day()]);
    trackPingFindMany.mockImplementation(tableOf({ 'emp-1': pings(3, new Date()) }));

    await GET(request({ cookie: await cookieFor('ADMIN') }, '?employee=emp-1'));
    expect(fieldDayFindMany.mock.calls[0][0].where).toMatchObject({ employeeId: 'emp-1' });
  });

  it('неизвестный id — пусто, а не ошибка', async () => {
    fieldDayFindMany.mockResolvedValue([]);
    const res = await GET(request({ cookie: await cookieFor('ADMIN') }, '?employee=нет-такого'));
    expect(res.status).toBe(200);
    expect((await res.json()).people).toEqual([]);
  });

  it('без параметра спрашивает всех — старое поведение цело', async () => {
    fieldDayFindMany.mockResolvedValue([]);
    await GET(request({ cookie: await cookieFor('ADMIN') }));
    expect(fieldDayFindMany.mock.calls[0][0].where.employeeId).toBeUndefined();
  });
});

describe('GET /api/admin/tracking/live — порядок', () => {
  it('не приславший ни одной точки стоит выше всех молчащих', async () => {
    fieldDayFindMany.mockResolvedValue([
      day({ employeeId: 'emp-1', employee: { id: 'emp-1', name: 'Davlat' } }),
      day({ employeeId: 'emp-2', employee: { id: 'emp-2', name: 'ddd' } }),
    ]);
    trackPingFindMany.mockImplementation(
      tableOf({ 'emp-1': pings(3, new Date(Date.now() - 40 * 60_000)) }),
    );

    const res = await GET(request({ cookie: await cookieFor('ADMIN') }));
    const body = await res.json();
    expect(body.people.map((p: { name: string }) => p.name)).toEqual(['ddd', 'Davlat']);
  });
});

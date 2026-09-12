import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { GET } from './route';
import { SESSION_COOKIE, createSession } from '@/lib/session';

// ══════════════════════════════════════════════════════════════════════
// «Мой день» и подсказка «куда дальше».
//
// ПРОВЕРЯЮТСЯ ЗАПРЕТЫ, а не счастливый путь: список выглядит разумным
// всегда, и ошибка здесь тихая. Два запрета стоят ради человека в поле:
//
//   · смена закрыта — подсказок нет. Это и есть «до конца смены»: закрыл
//     смену, и подсказки замолчали сами;
//   · позиция старше получаса — подсказок нет. «Ближайший» от точки,
//     которой полчаса, — это совет ехать не туда.
//
// И оба обязаны ОБЪЯСНЯТЬ себя словами: пустой список без причины читается
// как поломка экрана.
// ══════════════════════════════════════════════════════════════════════

const employeeFindUnique = vi.fn();
const employeeFindMany = vi.fn();
const shiftFindFirst = vi.fn();
const trackPingFindFirst = vi.fn();
const visitPlanFindMany = vi.fn();
const interactionFindMany = vi.fn();
const deliveryRouteFindFirst = vi.fn();
const customerFindMany = vi.fn();
const trackStayFindMany = vi.fn();

vi.mock('@repo/database', () => ({
  prisma: {
    employee: {
      findUnique: (...a: unknown[]) => employeeFindUnique(...a),
      findMany: (...a: unknown[]) => employeeFindMany(...a),
    },
    shift: { findFirst: (...a: unknown[]) => shiftFindFirst(...a) },
    trackPing: { findFirst: (...a: unknown[]) => trackPingFindFirst(...a) },
    visitPlan: { findMany: (...a: unknown[]) => visitPlanFindMany(...a) },
    interaction: { findMany: (...a: unknown[]) => interactionFindMany(...a) },
    deliveryRoute: { findFirst: (...a: unknown[]) => deliveryRouteFindFirst(...a) },
    trackStay: { findMany: (...a: unknown[]) => trackStayFindMany(...a) },
    customer: { findMany: (...a: unknown[]) => customerFindMany(...a) },
    crmOrder: { findMany: vi.fn() },
    stockMovement: { findMany: vi.fn() },
  },
}));

const SECRET = 'test-session-secret-value-at-least-32-chars';
const ME = { id: 'emp-1', name: 'Азиз', telegramId: null, isActive: true };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SESSION_SECRET', SECRET);
  // Секрет ЗАДАН и не посылается: пустой `BOT_SECRET` вне продакшна
  // открывает ботовую дверь всем, и проверка рубежа стала бы бутафорией.
  vi.stubEnv('BOT_SECRET', 'test-bot-secret');
  employeeFindMany.mockResolvedValue([ME]);
  employeeFindUnique.mockResolvedValue(ME);
  visitPlanFindMany.mockResolvedValue([]);
  interactionFindMany.mockResolvedValue([]);
  deliveryRouteFindFirst.mockResolvedValue(null);
  customerFindMany.mockResolvedValue([]);
  trackStayFindMany.mockResolvedValue([]);
  // Смена открыта и точка свежая — если сценарий не решит иначе.
  shiftFindFirst.mockResolvedValue({ id: 's1', startTime: new Date(), openedVia: 'pwa' });
  trackPingFindFirst.mockResolvedValue({
    at: new Date(), latitude: 39.654, longitude: 66.9597,
  });
});

async function request(role: 'ADMIN' | 'SELLER' | null = 'SELLER') {
  const headers: Record<string, string> = {};
  if (role) {
    const token = await createSession({ role, name: ME.name });
    headers.cookie = `${SESSION_COOKIE}=${token}`;
  }
  return new NextRequest('http://localhost:3000/api/admin/staff/day', { headers });
}

describe('GET /api/admin/staff/day — рубеж', () => {
  it('без подписи не пускает и говорит, что делать', async () => {
    const res = await GET(await request(null));
    expect(res.status).toBe(401);
    // Не «Unauthorized»: это читает человек в поле.
    expect((await res.json()).error).toMatch(/войдите/i);
  });

  it('продавца по сессии пускает — раньше дверь знала только бота', async () => {
    const res = await GET(await request('SELLER'));
    expect(res.status).toBe(200);
  });
});

describe('GET /api/admin/staff/day — запреты подсказки', () => {
  it('смена не начата — подсказок нет, и сказано почему', async () => {
    shiftFindFirst.mockResolvedValue(null);

    const body = await (await GET(await request())).json();
    expect(body.gate).toBe('shift');
    expect(body.next).toEqual([]);
    expect(body.gateText).toMatch(/смена/i);
  });

  it('позиция получасовой давности — подсказок нет', async () => {
    trackPingFindFirst.mockResolvedValue({
      at: new Date(Date.now() - 40 * 60_000), latitude: 39.654, longitude: 66.9597,
    });

    const body = await (await GET(await request())).json();
    expect(body.gate).toBe('position');
    expect(body.next).toEqual([]);
    expect(body.gateText).not.toBe('');
  });

  it('трансляция не включалась вовсе — тот же запрет, а не пустой экран', async () => {
    trackPingFindFirst.mockResolvedValue(null);
    const body = await (await GET(await request())).json();
    expect(body.gate).toBe('position');
  });

  it('порог отдаётся в ответе, чтобы копий числа не было', async () => {
    const body = await (await GET(await request())).json();
    expect(body.freshAfterMin).toBe(30);
  });
});

describe('GET /api/admin/staff/day — подсказки', () => {
  it('назначенные точки приходят с причиной и расстоянием', async () => {
    visitPlanFindMany.mockResolvedValue([
      {
        id: 1,
        planDate: new Date(),
        assignee: ME.name,
        author: 'Владелец',
        source: 'owner',
        acceptedAt: null,
        items: [],
        stops: [
          {
            customerId: 5,
            orderIndex: 0,
            customer: {
              id: 5, name: 'Плов Центр', companyName: null,
              latitude: 39.66, longitude: 66.97,
            },
          },
        ],
      },
    ]);

    const body = await (await GET(await request())).json();
    expect(body.gate).toBeNull();
    expect(body.next).toHaveLength(1);
    expect(body.next[0].reason).toBe('в объезде, точка №1');
    expect(body.next[0].kmLabel).toMatch(/м|км/);
    // Тот же блок уезжает в Telegram готовым текстом — бот его не собирает.
    expect(body.text).toContain('Куда дальше');
  });

  it('плана нет — подсказка всё равно есть: тогда она и нужнее всего', async () => {
    const body = await (await GET(await request())).json();
    expect(body.has).toBe(false);
    expect(body.gate).toBeNull();
  });
});

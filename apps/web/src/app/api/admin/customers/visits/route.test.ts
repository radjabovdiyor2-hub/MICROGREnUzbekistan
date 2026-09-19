import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from './route';
import { SESSION_COOKIE, createSession } from '@/lib/session';

// ══════════════════════════════════════════════════════════════════════
// ДВЕРЬ ОТМЕТКИ ВИЗИТА.
//
// ПОЧЕМУ ЭТОТ ФАЙЛ ПОЯВИЛСЯ ПОЗЖЕ ВСЕХ. Владелец сказал: «не работают
// отметки клиентов — договорились, перезвонить и так далее». Стали
// разбирать — у роута, который эти отметки и пишет, не было ни одной
// проверки. То есть единственный способ узнать, работает ли он, был
// съездить к клиенту и нажать кнопку.
//
// ЧТО ИМЕННО ЗДЕСЬ ЗАКРЕПЛЕНО. Не «вернул 200»: это видно и так. Закреплены
// четыре решения, которые ломаются молча и стоят дорого.
//
//   1. РАССТОЯНИЕ СЧИТАЕТ СЕРВЕР. Тело запроса пишет тот, чью
//      добросовестность мы и проверяем; присланному «я был в 12 метрах»
//      верить нельзя по определению.
//
//   2. ОСТАНОВКА ПЛАНА ЗАКРЫВАЕТСЯ ПО МЕСТНОЙ ПОЛУНОЧИ. План сохраняется
//      местной полуночью, и выборка по UTC не нашла бы его вовсе: в
//      Ташкенте это пять утра предыдущего дня. Ошибка в пять часов не
//      падает, не логируется и выглядит как «отметка не засчиталась».
//
//   3. ОТМЕТКА ИЗ ОЧЕРЕДИ ЗАКРЫВАЕТ СВОЙ ДЕНЬ. Без связи отметка уезжает
//      часами позже; закрой она сегодняшнюю остановку — вчерашний объезд
//      навсегда остался бы невыполненным, а сегодняшний выполненным зря.
//
//   4. ПОБОЧНОЕ НЕ РОНЯЕТ ГЛАВНОЕ. Стоянки и плана может не быть вовсе, и
//      их отсутствие не делает поездку несостоявшейся.
// ══════════════════════════════════════════════════════════════════════

const customerFindUnique = vi.fn();
const interactionCreate = vi.fn();
const trackStayUpdateMany = vi.fn();
const visitPlanStopUpdateMany = vi.fn();

vi.mock('@repo/database', () => ({
  prisma: {
    customer: { findUnique: (...a: unknown[]) => customerFindUnique(...a) },
    interaction: { create: (...a: unknown[]) => interactionCreate(...a) },
    trackStay: { updateMany: (...a: unknown[]) => trackStayUpdateMany(...a) },
    visitPlanStop: { updateMany: (...a: unknown[]) => visitPlanStopUpdateMany(...a) },
  },
  Prisma: {},
}));

// Журнал и шина к предмету проверки не относятся, но ходят наружу.
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));
vi.mock('@/lib/realtime/bus', () => ({ publish: vi.fn() }));

const SECRET = 'test-session-secret-value-at-least-32-chars';
const SELLER = 'Азиз';

/** Клиент с пином: без координат расстояние считать не от чего. */
const CUSTOMER = {
  id: 5,
  name: 'Плов Центр',
  companyName: null,
  latitude: 39.6542,
  longitude: 66.9597,
};

async function sellerCookie(): Promise<string> {
  const token = await createSession({ role: 'SELLER', name: SELLER });
  return `${SESSION_COOKIE}=${token}`;
}

function request(body: unknown, cookie?: string) {
  return new NextRequest('http://localhost:3000/api/admin/customers/visits', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: cookie ? { cookie, 'Content-Type': 'application/json' } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SESSION_SECRET', SECRET);
  vi.stubEnv('BOT_SECRET', '');
  customerFindUnique.mockResolvedValue(CUSTOMER);
  interactionCreate.mockResolvedValue({ id: 77, createdAt: new Date() });
  trackStayUpdateMany.mockResolvedValue({ count: 0 });
  visitPlanStopUpdateMany.mockResolvedValue({ count: 0 });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('POST /api/admin/customers/visits — рубеж и разбор', () => {
  it('без сессии отвечает 401 и в базу не ходит', async () => {
    const res = await POST(request({ customerId: 5, type: 'visit_deal' }));

    expect(res.status).toBe(401);
    expect(customerFindUnique).not.toHaveBeenCalled();
    expect(interactionCreate).not.toHaveBeenCalled();
  });

  it('продавца пускает: ездит он, ему и отмечать', async () => {
    const res = await POST(
      request({ customerId: 5, type: 'visit_deal' }, await sellerCookie()),
    );

    expect(res.status).toBe(200);
    expect(interactionCreate).toHaveBeenCalledTimes(1);
  });

  it('неизвестный исход визита отклоняет, ничего не записав', async () => {
    const res = await POST(
      request({ customerId: 5, type: 'visit_teleport' }, await sellerCookie()),
    );

    expect(res.status).toBe(400);
    expect(interactionCreate).not.toHaveBeenCalled();
  });

  it('несуществующего клиента отклоняет, а не пишет висячую строку', async () => {
    // `customer_id` в interactions необязателен, и без этой проверки
    // отметка к небытию легла бы в базу молча.
    customerFindUnique.mockResolvedValue(null);

    const res = await POST(
      request({ customerId: 999, type: 'visit_deal' }, await sellerCookie()),
    );

    expect(res.status).toBe(404);
    expect(interactionCreate).not.toHaveBeenCalled();
  });

  it('длинную заметку режет, а не отклоняет', async () => {
    // Человек уже съездил: терять отметку из-за длины обиднее, чем хвост
    // заметки.
    const res = await POST(
      request(
        { customerId: 5, type: 'visit_callback', note: 'я'.repeat(5000) },
        await sellerCookie(),
      ),
    );

    expect(res.status).toBe(200);
    const data = interactionCreate.mock.calls[0][0].data;
    expect(data.summary.length).toBeLessThan(5000);
  });
});

describe('POST /api/admin/customers/visits — что попадает в запись', () => {
  it('исход, автор и признак решённости', async () => {
    await POST(request({ customerId: 5, type: 'visit_deal' }, await sellerCookie()));

    const data = interactionCreate.mock.calls[0][0].data;
    expect(data.interactionType).toBe('visit_deal');
    // Кто съездил. Без имени на вопрос «кто был у Плов Центра во вторник»
    // ответить нечем — пока продавец один, это незаметно.
    expect(data.botName).toBe(SELLER);
    // «Договорились» — закрытый вопрос.
    expect(data.resolved).toBe(true);
  });

  it('«перезвонить» остаётся нерешённым: это хвост работы', async () => {
    await POST(request({ customerId: 5, type: 'visit_callback' }, await sellerCookie()));

    expect(interactionCreate.mock.calls[0][0].data.resolved).toBe(false);
  });

  it('расстояние считает СЕРВЕР, а присланное игнорирует', async () => {
    // Полградуса широты — примерно 55 км. Если бы дверь верила телу
    // запроса, в записи оказалось бы 12.
    await POST(
      request(
        {
          customerId: 5,
          type: 'visit_deal',
          latitude: CUSTOMER.latitude + 0.5,
          longitude: CUSTOMER.longitude,
          distanceM: 12,
        },
        await sellerCookie(),
      ),
    );

    const data = interactionCreate.mock.calls[0][0].data;
    expect(data.distanceM).toBeGreaterThan(50_000);
  });

  it('кривые координаты отбрасывает: они обвинили бы человека числом', async () => {
    await POST(
      request(
        { customerId: 5, type: 'visit_deal', latitude: 1000, longitude: 5 },
        await sellerCookie(),
      ),
    );

    const data = interactionCreate.mock.calls[0][0].data;
    expect(data.latitude).toBeNull();
    expect(data.distanceM).toBeNull();
  });

  it('без пина у клиента пишет позицию, но не расстояние', async () => {
    customerFindUnique.mockResolvedValue({ ...CUSTOMER, latitude: null, longitude: null });

    await POST(
      request(
        { customerId: 5, type: 'visit_deal', latitude: 39.65, longitude: 66.95 },
        await sellerCookie(),
      ),
    );

    const data = interactionCreate.mock.calls[0][0].data;
    expect(data.latitude).toBe(39.65);
    expect(data.distanceM).toBeNull();
  });
});

describe('POST /api/admin/customers/visits — закрытие остановки плана', () => {
  it('ищет план по МЕСТНОЙ полуночи, а не по UTC', async () => {
    // Ошибка в пять часов не падает и не логируется: она выглядит как
    // «отметка не засчиталась», и искать её пришлось бы в отчёте.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-19T13:00:00+05:00'));

    await POST(request({ customerId: 5, type: 'visit_deal' }, await sellerCookie()));

    expect(visitPlanStopUpdateMany).toHaveBeenCalledTimes(1);
    const where = visitPlanStopUpdateMany.mock.calls[0][0].where;

    const expected = new Date();
    expected.setHours(0, 0, 0, 0);
    expect(where.plan.planDate.getTime()).toBe(expected.getTime());
    expect(where.plan.assignee).toBe(SELLER);
    // Уникальное поле: вечерний повторный заезд не должен отбирать
    // остановку у утренней отметки.
    expect(where.interactionId).toBeNull();
  });

  it('отметка из очереди закрывает СВОЙ день, а не сегодняшний', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-19T09:00:00+05:00'));

    // Съездил вчера в обед, связь появилась сегодня утром.
    const yesterdayNoon = new Date('2026-09-18T12:00:00+05:00');
    await POST(
      request(
        { customerId: 5, type: 'visit_deal', visitedAt: yesterdayNoon.getTime() },
        await sellerCookie(),
      ),
    );

    const where = visitPlanStopUpdateMany.mock.calls[0][0].where;
    const expected = new Date(yesterdayNoon);
    expected.setHours(0, 0, 0, 0);
    expect(where.plan.planDate.getTime()).toBe(expected.getTime());
  });

  it('отсутствие плана и стоянки не делает поездку несостоявшейся', async () => {
    visitPlanStopUpdateMany.mockResolvedValue({ count: 0 });
    trackStayUpdateMany.mockResolvedValue({ count: 0 });

    const res = await POST(
      request({ customerId: 5, type: 'visit_absent' }, await sellerCookie()),
    );

    expect(res.status).toBe(200);
  });
});

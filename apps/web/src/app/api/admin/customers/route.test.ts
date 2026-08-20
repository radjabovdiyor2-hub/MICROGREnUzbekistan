import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { SESSION_COOKIE, createSession } from '@/lib/session';

// ══════════════════════════════════════════════════════════════════════
// Роут клиентов админки.
//
// Тестов у него не было вовсе, а роут отвечает и за список с фильтрами, и
// за правку карточки. Закрепляем то, что ломается молча:
//
//   • фильтр принимает только известные значения — иначе пустой ответ
//     неотличим от «клиентов нет», а причина в опечатке в адресной строке;
//   • пустая строка СНИМАЕТ тип заведения и аудиторию, а не игнорируется:
//     форма предлагает «Не указан», и выбор обязан что-то делать;
//   • выясненная человеком аудитория помечается 'manual' — иначе ночной
//     сбор затрёт её своей догадкой по названию;
//   • оповещение шины уходит на ЗАПИСИ и не уходит на чтении.
// ══════════════════════════════════════════════════════════════════════

const customerFindMany = vi.fn();
const customerCount = vi.fn();
const customerUpdate = vi.fn();

vi.mock('@repo/database', () => ({
  prisma: {
    customer: {
      findMany: (...a: unknown[]) => customerFindMany(...a),
      count: (...a: unknown[]) => customerCount(...a),
      update: (...a: unknown[]) => customerUpdate(...a),
    },
  },
  Prisma: {},
}));

const publishSpy = vi.fn();
vi.mock('@/lib/realtime/bus', () => ({ publish: (...a: unknown[]) => publishSpy(...a) }));

vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));

// Карточка собирается отдельным модулем и ходит в базу сама — здесь она
// не проверяется, важно лишь что GET карточки НЕ трогает шину.
vi.mock('@/lib/customers/card', () => ({
  getCustomerCard: vi.fn(async (id: number) => ({ id, name: 'Клиент', orders: [] })),
}));

// Баллы лежат на аккаунте витрины, а не в карточке CRM.
vi.mock('@/lib/customers/bonus', () => ({
  setCustomerBonus: vi.fn(async () => ({ ok: true })),
}));

import { GET, PUT } from './route';

async function adminCookie(): Promise<string> {
  const token = await createSession({ role: 'ADMIN', name: 'owner' });
  return `${SESSION_COOKIE}=${token}`;
}

function get(query = '', cookie?: string) {
  return new NextRequest(`http://localhost:3000/api/admin/customers${query}`, {
    headers: cookie ? { cookie } : {},
  });
}

function put(body: unknown, cookie?: string) {
  return new NextRequest('http://localhost:3000/api/admin/customers', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

/** WHERE, с которым роут пошёл в базу. */
function lastWhere(): Record<string, unknown> {
  return customerFindMany.mock.calls[0][0].where;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SESSION_SECRET = 'test-session-secret-value-at-least-32-chars';
  customerFindMany.mockResolvedValue([]);
  customerCount.mockResolvedValue(0);
  customerUpdate.mockResolvedValue({
    id: 7, status: 'lead', bonusBalance: 0, notes: null,
    city: 'Samarqand', companyName: 'X', companyType: 'fitness', audience: 'female',
  });
});

describe('GET /api/admin/customers — фильтры', () => {
  it('тип заведения и аудитория доезжают до WHERE', async () => {
    await GET(get('?companyType=toyxona&audience=female', await adminCookie()));

    expect(lastWhere().companyType).toBe('toyxona');
    expect(lastWhere().audience).toBe('female');
  });

  it('выдуманные значения в WHERE не попадают', async () => {
    await GET(get('?companyType=вымысел&audience=вымысел&district=вымысел', await adminCookie()));

    const where = lastWhere();
    expect(where.companyType).toBeUndefined();
    expect(where.audience).toBeUndefined();
    expect(where.district).toBeUndefined();
  });

  it('прототипные имена не считаются известными типами', async () => {
    // `'constructor' in COMPANY_TYPES` отвечает true — отсюда и проверка.
    await GET(get('?companyType=constructor&district=toString', await adminCookie()));

    expect(lastWhere().companyType).toBeUndefined();
    expect(lastWhere().district).toBeUndefined();
  });

  it('«не выяснено» — это IS NULL, а не значение', async () => {
    await GET(get('?audience=unknown', await adminCookie()));

    expect(lastWhere().audience).toBeNull();
  });

  it('район из справочника проходит', async () => {
    await GET(get('?district=urgut', await adminCookie()));

    expect(lastWhere().district).toBe('urgut');
  });

  it('b2b кладётся в customerType, а не в status', async () => {
    await GET(get('?status=b2b', await adminCookie()));

    expect(lastWhere().customerType).toBe('b2b');
    expect(lastWhere().status).toBeUndefined();
  });

  it('чтение карточки НЕ трогает шину', async () => {
    // Раньше publish стоял именно здесь: чтение рассылало инвалидацию, все
    // клиенты шли перечитывать карточку, и каждый их GET рассылал следующую
    // волну.
    await GET(get('?id=7', await adminCookie()));

    expect(publishSpy).not.toHaveBeenCalled();
  });
});

describe('PUT /api/admin/customers — правка карточки', () => {
  it('тип заведения и аудитория сохраняются', async () => {
    await PUT(put({ id: 7, companyType: 'fitness', audience: 'female' }, await adminCookie()));

    const data = customerUpdate.mock.calls[0][0].data;
    expect(data.companyType).toBe('fitness');
    expect(data.audience).toBe('female');
  });

  it('выясненная человеком аудитория помечается ручной', async () => {
    // Иначе ночной сбор затрёт её догадкой по названию.
    await PUT(put({ id: 7, audience: 'male' }, await adminCookie()));

    expect(customerUpdate.mock.calls[0][0].data.audienceSource).toBe('manual');
  });

  it('пустая строка снимает аудиторию и метку источника', async () => {
    await PUT(put({ id: 7, audience: '' }, await adminCookie()));

    const data = customerUpdate.mock.calls[0][0].data;
    expect(data.audience).toBeNull();
    expect(data.audienceSource).toBeNull();
  });

  it('пустая строка снимает тип заведения', async () => {
    // Форма предлагает пункт «Не указан» — он обязан что-то делать.
    await PUT(put({ id: 7, companyType: '' }, await adminCookie()));

    expect(customerUpdate.mock.calls[0][0].data.companyType).toBeNull();
  });

  it('выдуманный тип не затирает существующий', async () => {
    await PUT(put({ id: 7, companyType: 'вымысел', audience: 'вымысел' }, await adminCookie()));

    const data = customerUpdate.mock.calls[0][0].data;
    expect(data.companyType).toBeUndefined();
    expect(data.audience).toBeUndefined();
    expect(data.audienceSource).toBeUndefined();
  });

  it('правка оповещает шину — иначе карта в соседней вкладке врёт', async () => {
    await PUT(put({ id: 7, status: 'vip' }, await adminCookie()));

    expect(publishSpy).toHaveBeenCalledWith('customers');
  });

  it('без сессии ничего не пишет', async () => {
    const res = await PUT(put({ id: 7, status: 'vip' }));

    expect(res.status).toBe(401);
    expect(customerUpdate).not.toHaveBeenCalled();
    expect(publishSpy).not.toHaveBeenCalled();
  });
});

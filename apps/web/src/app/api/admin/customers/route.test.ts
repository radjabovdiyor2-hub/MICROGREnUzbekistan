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
// Удаление МЯГКОЕ: карточка помечается `deletedAt`, а не стирается.
// Раньше здесь ждали `deleteMany` — теперь ждём пометку, иначе тест
// зеленел бы на физическом удалении, которое вернуть нечем.
const customerUpdateMany = vi.fn();
const customerFindUnique = vi.fn();

vi.mock('@repo/database', () => ({
  prisma: {
    customer: {
      findMany: (...a: unknown[]) => customerFindMany(...a),
      count: (...a: unknown[]) => customerCount(...a),
      findUnique: (...a: unknown[]) => customerFindUnique(...a),
      update: (...a: unknown[]) => customerUpdate(...a),
      updateMany: (...a: unknown[]) => customerUpdateMany(...a),
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

import { DELETE, GET, PUT } from './route';

async function adminCookie(): Promise<string> {
  const token = await createSession({ role: 'ADMIN', name: 'owner' });
  return `${SESSION_COOKIE}=${token}`;
}

function get(query = '', cookie?: string) {
  return new NextRequest(`http://localhost:3000/api/admin/customers${query}`, {
    headers: cookie ? { cookie } : {},
  });
}

function del(query: string, cookie?: string) {
  return new NextRequest(`http://localhost:3000/api/admin/customers${query}`, {
    method: 'DELETE',
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
  customerUpdateMany.mockResolvedValue({ count: 0 });
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

  // ── Статус и тип клиента — РАЗНЫЕ оси ────────────────────────────
  //
  // Раньше они лежали в одном ряду кнопок, и «b2b» подставлялся в
  // `where.status`: статуса «b2b» в базе не бывает, поэтому кнопка всегда
  // возвращала пустой список. Дефект чинили подменой — если пришёл b2b,
  // класть его в customerType. Пока выбор был одиночным, это работало.
  //
  // Множественный выбор подмену ломает: «vip,b2b» одной строкой уже не
  // разложить, и вопрос «VIP и B2B» или «VIP или B2B» ответа не имеет.
  // Поэтому оси разделены на два параметра.
  it('тип клиента приходит своим параметром, а не через статус', async () => {
    await GET(get('?customerType=b2b', await adminCookie()));

    expect(lastWhere().customerType).toBe('b2b');
    expect(lastWhere().status).toBeUndefined();
  });

  it('«b2b» в статусе больше не значит ничего — это не статус', async () => {
    // Ни подмены, ни пустого списка: несуществующий статус просто
    // отсеивается, и человек видит всех, а не «никого».
    await GET(get('?status=b2b', await adminCookie()));

    expect(lastWhere().status).toBeUndefined();
    expect(lastWhere().customerType).toBeUndefined();
  });

  it('несколько статусов дают IN', async () => {
    await GET(get('?status=lead,active', await adminCookie()));

    expect(lastWhere().status).toEqual({ in: ['lead', 'active'] });
  });

  it('один статус остаётся равенством, а не списком из одного', async () => {
    // Не косметика: планы запроса у `=` и `IN (…)` разные.
    await GET(get('?status=vip', await adminCookie()));

    expect(lastWhere().status).toBe('vip');
  });

  it('оси складываются через И: активные B2B', async () => {
    // Вопрос, на который прежний одноосный фильтр ответить не мог вовсе.
    await GET(get('?status=active&customerType=b2b', await adminCookie()));

    expect(lastWhere().status).toBe('active');
    expect(lastWhere().customerType).toBe('b2b');
  });

  it('оба типа сразу — то же, что не фильтровать', async () => {
    await GET(get('?customerType=b2b,b2c', await adminCookie()));

    expect(lastWhere().customerType).toBeUndefined();
  });

  it('несколько типов заведений дают IN — как на карте', async () => {
    // Список и карта — два вида одного раздела, и понимать параметр
    // по-разному им нельзя.
    await GET(get('?companyType=restaurant,cafe', await adminCookie()));

    expect(lastWhere().companyType).toEqual({ in: ['restaurant', 'cafe'] });
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

// ══════════════════════════════════════════════════════════════════════
// Чистка выведенных типов (?scope=retired-types).
//
// Вузы и колледжи набрал ночной сбор, пока категория `school` была в
// справочнике. Категорию убрали — собранное осталось. Здесь закрепляется
// то, из-за чего такая чистка и опасна: она удаляет пачкой.
// ══════════════════════════════════════════════════════════════════════

const RETIRED_CARD = {
  id: 41, name: 'SamDU', companyName: 'SamDU', city: 'Samarqand',
  companyType: 'school', district: 'siyob',
};

describe('DELETE /api/admin/customers?scope=retired-types', () => {
  it('удаляет только выведенные типы и только нетронутых лидов', async () => {
    await DELETE(del('?scope=retired-types&dryRun=1', await adminCookie()));

    const where = customerFindMany.mock.calls[0][0].where;
    expect(where.companyType).toEqual({ in: ['clinic', 'supermarket', 'school', 'office'] });
    // Карточка, которая покупала или за которой стоит человек, не уходит:
    // без этих условий чистка по типу унесла бы и клиента с историей.
    expect(where.crmOrders).toEqual({ none: {} });
    expect(where.status).toBe('lead');
    expect(where.ordersCount).toBe(0);
    expect(where.totalSpent).toBe(0);
    expect(where.webUserId).toBeNull();
    expect(where.telegramId).toBeNull();
  });

  it('просмотр показывает список и не удаляет ничего', async () => {
    customerFindMany.mockResolvedValueOnce([RETIRED_CARD]).mockResolvedValueOnce([]);
    customerCount.mockResolvedValueOnce(3);

    const res = await DELETE(del('?scope=retired-types&dryRun=1', await adminCookie()));
    const body = await res.json();

    expect(body.dryRun).toBe(true);
    expect(body.matched).toBe(1);
    expect(body.deleted).toBe(0);
    expect(body.preview[0].name).toBe('SamDU');
    // 3 карточки выведенных типов всего, 1 под чистку → 2 остаются.
    expect(body.kept).toBe(2);
    expect(customerUpdateMany).not.toHaveBeenCalled();
    expect(publishSpy).not.toHaveBeenCalled();
  });

  it('боевой прогон помечает по id и оповещает шину', async () => {
    customerFindMany.mockResolvedValueOnce([RETIRED_CARD]);
    customerCount.mockResolvedValueOnce(1);
    customerUpdateMany.mockResolvedValueOnce({ count: 1 });

    const res = await DELETE(del('?scope=retired-types', await adminCookie()));
    const body = await res.json();

    // Метка, а не удаление: строка остаётся, читатели её больше не видят.
    expect(customerUpdateMany).toHaveBeenCalledTimes(1);
    expect(customerUpdateMany.mock.calls[0][0].where).toEqual({ id: { in: [41] } });
    expect(customerUpdateMany.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
    expect(body.deleted).toBe(1);
    expect(publishSpy).toHaveBeenCalledWith('customers');
  });

  it('подсказка по названию собирается только в просмотре', async () => {
    // «Столовая СамГУ» лежит как `canteen` и под чистку по типу не подпадает,
    // но и удалять её автоматически нельзя: под тот же шаблон подходит
    // «Кафе Универсал». В боевом прогоне запроса нет вовсе.
    customerFindMany.mockResolvedValueOnce([]);
    customerCount.mockResolvedValueOnce(0);

    await DELETE(del('?scope=retired-types', await adminCookie()));
    expect(customerFindMany).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    customerFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    customerCount.mockResolvedValueOnce(0);

    await DELETE(del('?scope=retired-types&dryRun=1', await adminCookie()));
    const hints = customerFindMany.mock.calls[1][0].where;
    expect(hints.NOT).toEqual({ companyType: { in: ['clinic', 'supermarket', 'school', 'office'] } });
    expect(hints.OR.some((c: Record<string, { contains?: string }>) => c.name?.contains === 'колледж')).toBe(true);
  });

  it('без сессии не удаляет', async () => {
    const res = await DELETE(del('?scope=retired-types'));

    expect(res.status).toBe(401);
    expect(customerUpdateMany).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════
// Удаление одной карточки: пометка, а не стирание.
//
// Физически удалённую карточку вернуть нечем, а ошибиться легко — вместе с
// ней уходили пины на карте, договорные цены и заметки продавца. Проверяем
// не текст ответа, а то, ЧТО именно уходит в базу.
// ══════════════════════════════════════════════════════════════════════
describe('DELETE /api/admin/customers?id=', () => {
  it('помечает карточку, а не стирает строку', async () => {
    customerFindUnique.mockResolvedValueOnce({
      id: 7,
      name: 'Плов Центр',
      _count: { crmOrders: 0, interactions: 3, followups: 1 },
    });
    customerUpdate.mockResolvedValueOnce({ id: 7 });

    const res = await DELETE(del('?id=7', await adminCookie()));

    expect(res.status).toBe(200);
    expect(customerUpdate).toHaveBeenCalledTimes(1);
    expect(customerUpdate.mock.calls[0][0].where).toEqual({ id: 7 });
    expect(customerUpdate.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
  });

  it('клиента с заказами по-прежнему не трогает', async () => {
    // История продаж дороже порядка в списке: отвечаем 409 с числом.
    customerFindUnique.mockResolvedValueOnce({
      id: 8,
      name: 'Дом Плова',
      _count: { crmOrders: 4, interactions: 0, followups: 0 },
    });

    const res = await DELETE(del('?id=8', await adminCookie()));

    expect(res.status).toBe(409);
    expect(customerUpdate).not.toHaveBeenCalled();
  });
});

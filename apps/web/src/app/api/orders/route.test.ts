import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, GET, PUT } from './route';
import { NextRequest } from 'next/server';
import { CUSTOMER_TTL_SECONDS, SESSION_COOKIE, createSession } from '@/lib/session';

type FindManyArgs = { where: Record<string, unknown> };

const findMany = vi.fn((_args: FindManyArgs) => Promise.resolve([] as unknown[]));
const count = vi.fn((_args: FindManyArgs) => Promise.resolve(0));
// Каталог для резолва цен: сервер обязан брать цену отсюда, а не из тела.
const productFindMany = vi.fn((_args: FindManyArgs) => Promise.resolve([] as unknown[]));

// Mock Prisma
vi.mock('@repo/database', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    order: {
      create: vi.fn(),
      findMany: (args: FindManyArgs) => findMany(args),
      count: (args: FindManyArgs) => count(args),
    },
    stockMovement: {
      create: vi.fn(),
    },
    product: {
      update: vi.fn(),
      findMany: (args: FindManyArgs) => productFindMany(args),
    },
    $transaction: vi.fn((callbacks) => Promise.resolve(callbacks)),
    Prisma: {},
    OrderStatus: {},
  }
}));

function createRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/orders', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}


/** Мок Prisma для сценариев создания заказа: пользователь и транзакция. */
async function stubPrisma(orderCreate: ReturnType<typeof vi.fn>) {
  const { prisma } = await import('@repo/database');
  const mocked = prisma as unknown as {
    user: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
  mocked.user.findUnique.mockResolvedValue(null);
  mocked.user.upsert = vi.fn().mockResolvedValue({ id: 'u1', bonusPoints: 0 });
  mocked.$transaction.mockImplementation(async (cb: unknown) =>
    typeof cb === 'function'
      ? cb({ order: { create: orderCreate }, user: { updateMany: vi.fn() } })
      : cb,
  );
}

describe('POST /api/orders', () => {
  beforeEach(() => {
    // Секрет задан: иначе requireBotAuth в dev считает доверенным КОГО УГОДНО,
    // и проверка «цена из браузера игнорируется» ничего бы не проверяла.
    // (В проде пустой BOT_SECRET — это fail closed, доверенных нет вовсе.)
    vi.stubEnv('BOT_SECRET', 'test-bot-secret-value');
  });

  it('should return 400 if personal data is missing', async () => {
    const req = createRequest({
      items: [{ productId: '123', price: 100, quantity: 1 }]
    });
    
    const response = await POST(req);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Shaxsiy ma'lumotlar to'liq emas");
  });

  // ══════════════════════════════════════════════════════════════════
  // Цену назначает сервер.
  //
  // `subtotal` складывался из присланного `item.price`, и та же цена ложилась
  // в `order_items`: тело `{"price": 1, "quantity": 100}` списывало сотню
  // лотков со склада и уходило в P&L по одному суму.
  // ══════════════════════════════════════════════════════════════════
  it('отказывает, если товара нет в каталоге', async () => {
    productFindMany.mockResolvedValueOnce([]);
    const req = createRequest({
      customer: { firstName: 'Test', phone: '+998901234567', address: 'Tashkent' },
      items: [{ productId: 'ghost', price: 1, quantity: 100 }],
    });

    const response = await POST(req);
    expect(response.status).toBe(409);
  });

  it('запрашивает у каталога только активные товары из корзины', async () => {
    productFindMany.mockClear();
    productFindMany.mockResolvedValueOnce([]);
    await POST(createRequest({
      customer: { firstName: 'Test', phone: '+998901234567', address: 'Tashkent' },
      items: [{ productId: 'p1', price: 1, quantity: 100 }],
    }));

    expect(productFindMany).toHaveBeenCalled();
    expect(productFindMany.mock.calls[0][0]).toMatchObject({
      where: { id: { in: ['p1'] }, isActive: true },
    });
  });

  it('игнорирует цену из браузера и берёт каталожную', async () => {
    productFindMany.mockResolvedValueOnce([{ id: 'p1', price: 15000 }]);
    const created = vi.fn().mockResolvedValue({ id: 'o1', orderNumber: 'M-1', items: [] });
    await stubPrisma(created);

    await POST(createRequest({
      customer: { firstName: 'Test', phone: '+998901234567', address: 'Tashkent' },
      items: [{ productId: 'p1', price: 1, quantity: 2 }],
    }));

    expect(created).toHaveBeenCalled();
    const data = created.mock.calls[0][0].data;
    expect(data.items.create[0].price).toBe(15000);
    expect(data.subtotal).toBe(30000);
  });

  it('доверенному офису оставляет договорную цену', async () => {
    productFindMany.mockResolvedValueOnce([{ id: 'p1', price: 15000 }]);
    const created = vi.fn().mockResolvedValue({ id: 'o2', orderNumber: 'M-2', items: [] });
    await stubPrisma(created);

    const req = new NextRequest('http://localhost:3000/api/orders', {
      method: 'POST',
      headers: { authorization: 'Bearer test-bot-secret-value' },
      body: JSON.stringify({
        source: 'ai_office',
        customer: { firstName: 'Жасмин', phone: '+998901234567', address: 'Самарканд' },
        items: [{ productId: 'p1', price: 12000, quantity: 10 }],
      }),
    });
    await POST(req);

    // Продажа ресторану по согласованной цене не должна подмениться прайсовой.
    const data = created.mock.calls[0][0].data;
    expect(data.items.create[0].price).toBe(12000);
    expect(data.subtotal).toBe(120000);
  });

  it('принимает дробное количество — салат продаётся за килограмм', async () => {
    productFindMany.mockResolvedValueOnce([{ id: 'p1', price: 15000 }]);
    const created = vi.fn().mockResolvedValue({ id: 'o3', orderNumber: 'M-3', items: [] });
    await stubPrisma(created);

    const res = await POST(createRequest({
      customer: { firstName: 'Test', phone: '+998901234567', address: 'Tashkent' },
      items: [{ productId: 'p1', quantity: 1.3 }],
    }));

    expect(res.status).not.toBe(400);
    const data = created.mock.calls[0][0].data;
    expect(data.items.create[0].quantity).toBe(1.3);
    expect(data.subtotal).toBe(19500);
  });

  it('третий знак после запятой отклоняет — столько колонка не хранит', async () => {
    // Раньше отбивалось любое дробное, и по той же причине: значение
    // проходило Zod и падало уже в Prisma безымянным 500. Теперь предел —
    // ровно тот, что помещается в колонку.
    const res = await POST(createRequest({
      customer: { firstName: 'Test', phone: '+998901234567', address: 'Tashkent' },
      items: [{ productId: 'p1', quantity: 1.234 }],
    }));
    expect(res.status).toBe(400);
  });

  it('доверенному офису записывает автора продажи', async () => {
    // У кассы автор был всегда, а продажи ИИ-офиса уходили в CRM с
    // registered_by="sales_bot": какой менеджер продал ресторану, из данных
    // было не видно.
    productFindMany.mockResolvedValueOnce([{ id: 'p1', price: 15000 }]);
    const created = vi.fn().mockResolvedValue({ id: 'o4', orderNumber: 'M-4', items: [] });
    await stubPrisma(created);

    const req = new NextRequest('http://localhost:3000/api/orders', {
      method: 'POST',
      headers: { authorization: 'Bearer test-bot-secret-value' },
      body: JSON.stringify({
        customer: { firstName: 'Жасмин', phone: '+998901234567', address: 'Самарканд' },
        items: [{ productId: 'p1', quantity: 2 }],
        performedBy: 'Диёр',
      }),
    });
    await POST(req);

    expect(created.mock.calls[0][0].data.performedBy).toBe('Диёр');
  });

  it('из браузера автора приписать нельзя', async () => {
    // Иначе покупатель приписал бы свой заказ любому сотруднику, а по этому
    // полю считается выработка — та же причина, по которой из браузера не
    // принимается договорная цена.
    productFindMany.mockResolvedValueOnce([{ id: 'p1', price: 15000 }]);
    const created = vi.fn().mockResolvedValue({ id: 'o5', orderNumber: 'M-5', items: [] });
    await stubPrisma(created);

    await POST(createRequest({
      customer: { firstName: 'Test', phone: '+998901234567', address: 'Tashkent' },
      items: [{ productId: 'p1', quantity: 1 }],
      performedBy: 'Диёр',
    }));

    expect(created.mock.calls[0][0].data.performedBy).toBeNull();
  });

  it('should return 400 if cart is empty', async () => {
    const req = createRequest({
      customer: { firstName: 'Test', phone: '+998901234567', address: 'Tashkent' },
      items: []
    });
    
    const response = await POST(req);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Savat bo'sh");
  });

  it('витринному боту договорную цену НЕ отдаёт, хотя секрет тот же', async () => {
    // `BOT_SECRET` один на офис и на витринный бот, но корзина бота живёт в
    // Redis семь суток. Пока «доверенный» значило «любой предъявитель
    // секрета», недельная цена из корзины уходила в заказ как согласованная —
    // товар продавался дешевле прайса, и никто этого не видел.
    productFindMany.mockResolvedValueOnce([{ id: 'p1', price: 15000 }]);
    const created = vi.fn().mockResolvedValue({ id: 'o3', orderNumber: 'M-3', items: [] });
    await stubPrisma(created);

    const req = new NextRequest('http://localhost:3000/api/orders', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-bot-secret-value',
        // Свой адрес: ограничитель частоты считает по IP, и к этому тесту
        // общий счётчик уже исчерпан предыдущими семнадцатью запросами.
        'x-forwarded-for': '10.0.0.77',
      },
      body: JSON.stringify({
        source: 'telegram_bot',
        customer: { firstName: 'Азиз', phone: '+998901234500', address: 'Самарканд' },
        items: [{ productId: 'p1', price: 9000, quantity: 2 }],
      }),
    });
    await POST(req);

    const data = created.mock.calls[0][0].data;
    expect(data.items.create[0].price).toBe(15000);
    expect(data.subtotal).toBe(30000);
  });

  it('незнакомый источник получает каталожную цену', async () => {
    // Новый интегратор безопасен по умолчанию: чтобы торговаться, источник
    // нужно назвать явно в NEGOTIATING_SOURCES.
    productFindMany.mockResolvedValueOnce([{ id: 'p1', price: 15000 }]);
    const created = vi.fn().mockResolvedValue({ id: 'o4', orderNumber: 'M-4', items: [] });
    await stubPrisma(created);

    const req = new NextRequest('http://localhost:3000/api/orders', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-bot-secret-value',
        'x-forwarded-for': '10.0.0.78',
      },
      body: JSON.stringify({
        source: 'partner_widget',
        customer: { firstName: 'Нодира', phone: '+998901234501', address: 'Самарканд' },
        items: [{ productId: 'p1', price: 1, quantity: 1 }],
      }),
    });
    await POST(req);

    expect(created.mock.calls[0][0].data.items.create[0].price).toBe(15000);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Кому видна история заказов.
//
// Признаком «свои заказы» раньше был сам факт того, что фильтр задан:
// подставил чужой userId или чужой номер телефона — получил чужую историю
// с адресами доставки. Теперь выборку покупателя задаёт его сессия.
// ══════════════════════════════════════════════════════════════════════

async function customerRequest(userId: string, query = ''): Promise<NextRequest> {
  const token = await createSession({ role: 'CUSTOMER', userId }, CUSTOMER_TTL_SECONDS);
  return new NextRequest(`http://localhost:3000/api/orders${query}`, {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  });
}

describe('PUT /api/orders', () => {
  // Смена статуса ОПЛАТЫ держалась на одном правиле в таблице префиксов
  // middleware: в самом роуте проверки не было, в отличие от соседнего
  // /api/admin/orders/[id].
  beforeEach(() => {
    vi.stubEnv('BOT_SECRET', 'test-bot-secret-value');
  });

  it('аноним не может пометить заказ оплаченным', async () => {
    const req = new NextRequest('http://localhost:3000/api/orders', {
      method: 'PUT',
      body: JSON.stringify({ id: 'o1', paymentStatus: 'PAID' }),
    });
    expect((await PUT(req)).status).toBe(401);
  });

  it('покупатель со своей сессией — тоже не может', async () => {
    const token = await createSession({ role: 'CUSTOMER', userId: 'u1' }, CUSTOMER_TTL_SECONDS);
    const req = new NextRequest('http://localhost:3000/api/orders', {
      method: 'PUT',
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      body: JSON.stringify({ id: 'o1', paymentStatus: 'PAID' }),
    });
    expect((await PUT(req)).status).toBe(401);
  });

  it('бот с общим секретом проходит', async () => {
    const req = new NextRequest('http://localhost:3000/api/orders', {
      method: 'PUT',
      headers: { authorization: 'Bearer test-bot-secret-value' },
      body: JSON.stringify({ id: 'o1' }),
    });
    // Без id вернулся бы 400; главное — не 401.
    expect((await PUT(req)).status).not.toBe(401);
  });
});

describe('GET /api/orders', () => {
  beforeEach(() => {
    findMany.mockClear();
    count.mockClear();
    // Секрет бота задан: иначе requireBotAuth в dev пускает всех и проверка
    // «аноним получает 401» ничего бы не проверяла.
    vi.stubEnv('BOT_SECRET', 'test-bot-secret-value');
  });

  it('отказывает анониму даже с фильтром по телефону', async () => {
    const req = new NextRequest('http://localhost:3000/api/orders?phone=998901234567');
    const response = await GET(req);

    expect(response.status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('покупателю отдаёт только его заказы', async () => {
    const response = await GET(await customerRequest('user-1'));

    expect(response.status).toBe(200);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0]).toMatchObject({ where: { userId: 'user-1' } });
  });

  it('игнорирует чужой userId и телефон из адреса запроса', async () => {
    const req = await customerRequest('user-1', '?userId=user-2&phone=998901234567');
    const response = await GET(req);

    expect(response.status).toBe(200);
    const where = findMany.mock.calls[0][0].where;
    expect(where.userId).toBe('user-1');
    expect(where.phone).toBeUndefined();
  });

  it('пускает витринного бота с общим секретом', async () => {
    const req = new NextRequest('http://localhost:3000/api/orders?phone=998901234567', {
      headers: { authorization: 'Bearer test-bot-secret-value' },
    });
    const response = await GET(req);

    expect(response.status).toBe(200);
    expect(findMany.mock.calls[0][0]).toMatchObject({ where: { phone: '998901234567' } });
  });
});

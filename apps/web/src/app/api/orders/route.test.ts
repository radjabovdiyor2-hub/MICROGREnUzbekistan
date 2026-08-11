import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, GET } from './route';
import { NextRequest } from 'next/server';
import { CUSTOMER_TTL_SECONDS, SESSION_COOKIE, createSession } from '@/lib/session';

type FindManyArgs = { where: Record<string, unknown> };

const findMany = vi.fn((_args: FindManyArgs) => Promise.resolve([] as unknown[]));
const count = vi.fn((_args: FindManyArgs) => Promise.resolve(0));

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

describe('POST /api/orders', () => {
  it('should return 400 if personal data is missing', async () => {
    const req = createRequest({
      items: [{ productId: '123', price: 100, quantity: 1 }]
    });
    
    const response = await POST(req);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Shaxsiy ma'lumotlar to'liq emas");
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

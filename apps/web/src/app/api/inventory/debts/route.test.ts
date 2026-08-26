import { describe, it, expect, vi, beforeEach } from 'vitest';

// ══════════════════════════════════════════════════════════════════════
// Долги: деньги меняются только платежом.
//
// ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ И ПОЧЕМУ ИМЕННО ЭТО
//
// Правка долга принимала тело ЦЕЛИКОМ: `const { id, payment, ...other }` и
// `data: other` прямо в `prisma.debt.update`. То есть запрос
// `{ id, isPaid: true }` закрывал любой долг, не заплатив ничего, а
// `{ id, paidAmount: 0 }` обнулял уже внесённое. В журнале это выглядит
// обычной правкой, и заметить такое можно только когда не сойдётся баланс.
//
// Второе: суммы не проверялись вовсе. Отрицательный платёж УМЕНЬШАЛ
// выплаченное, платёж больше долга уводил остаток в минус, а строка вместо
// числа роняла запрос пятисоткой из глубины Prisma.
//
// Тесты идут против настоящего роута с подменённой Prisma: предмет
// проверки — что именно уходит в `update`, а не база.
// ══════════════════════════════════════════════════════════════════════

const debtFindUnique = vi.fn();
const debtUpdate = vi.fn();
const debtCreate = vi.fn();

vi.mock('@repo/database', () => ({
  prisma: {
    debt: {
      findUnique: (...a: unknown[]) => debtFindUnique(...a),
      update: (...a: unknown[]) => debtUpdate(...a),
      create: (...a: unknown[]) => debtCreate(...a),
      findMany: vi.fn(),
    },
  },
}));

import { POST, PUT } from './route';

function request(body: unknown) {
  return {
    json: async () => body,
    url: 'http://localhost:3000/api/inventory/debts',
    headers: new Headers(),
  } as unknown as Parameters<typeof PUT>[0];
}

const DEBT = { id: 'd1', amount: 100_000, paidAmount: 20_000, isPaid: false };

beforeEach(() => {
  vi.clearAllMocks();
  debtFindUnique.mockResolvedValue(DEBT);
  debtUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...DEBT, ...data,
  }));
  debtCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'new', ...data,
  }));
});

describe('правка долга', () => {
  it('не даёт закрыть долг без оплаты', async () => {
    // Та самая дыра: одно поле в теле — и долг «оплачен».
    const res = await PUT(request({ id: 'd1', isPaid: true }));

    expect(res.status).toBe(400);
    expect(debtUpdate).not.toHaveBeenCalled();
  });

  it('не даёт переписать уже внесённую сумму', async () => {
    const res = await PUT(request({ id: 'd1', paidAmount: 0 }));

    expect(res.status).toBe(400);
    expect(debtUpdate).not.toHaveBeenCalled();
  });

  it('описательные поля править можно', async () => {
    const res = await PUT(request({ id: 'd1', personName: 'Плов Центр' }));

    expect(res.status).toBe(200);
    expect(debtUpdate).toHaveBeenCalledTimes(1);
    // В `update` уходит ТОЛЬКО перечисленное, а не всё тело.
    expect(debtUpdate.mock.calls[0][0].data).toEqual({ personName: 'Плов Центр' });
  });
});

describe('платёж', () => {
  it('увеличивает выплаченное и закрывает долг при полной оплате', async () => {
    const res = await PUT(request({ id: 'd1', payment: 80_000 }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(debtUpdate.mock.calls[0][0].data).toEqual({ paidAmount: 100_000, isPaid: true });
    expect(body.remaining).toBe(0);
  });

  it('отказывает в переплате: остаток не уходит в минус', async () => {
    const res = await PUT(request({ id: 'd1', payment: 500_000 }));

    expect(res.status).toBe(400);
    expect(debtUpdate).not.toHaveBeenCalled();
  });

  it('отрицательный платёж не принимается', async () => {
    // Иначе «платёж» уменьшал бы выплаченное.
    const res = await PUT(request({ id: 'd1', payment: -50_000 }));

    expect(res.status).toBe(400);
    expect(debtUpdate).not.toHaveBeenCalled();
  });

  it('строка вместо суммы — отказ, а не пятисотка', async () => {
    const res = await PUT(request({ id: 'd1', payment: '50000' }));

    expect(res.status).toBe(400);
    expect(debtUpdate).not.toHaveBeenCalled();
  });

  it('закрытый долг второй раз не оплачивают', async () => {
    debtFindUnique.mockResolvedValue({ ...DEBT, paidAmount: 100_000, isPaid: true });
    const res = await PUT(request({ id: 'd1', payment: 1000 }));

    expect(res.status).toBe(409);
  });
});

describe('создание долга', () => {
  it('требует сумму больше нуля', async () => {
    const res = await POST(request({ type: 'WE_OWE', personName: 'Поставщик', amount: 0 }));

    expect(res.status).toBe(400);
    expect(debtCreate).not.toHaveBeenCalled();
  });

  it('не принимает выдуманный тип долга', async () => {
    // Свободная строка уходила в колонку-enum и падала пятисоткой.
    const res = await POST(request({ type: 'MAYBE', personName: 'Кто-то', amount: 1000 }));

    expect(res.status).toBe(400);
  });

  it('нормальный долг создаётся', async () => {
    const res = await POST(request({
      type: 'WHO_OWES_US', personName: 'Плов Центр', amount: 250_000, phone: '+998901112233',
    }));

    expect(res.status).toBe(200);
    expect(debtCreate.mock.calls[0][0].data).toMatchObject({
      type: 'WHO_OWES_US', amount: 250_000, paidAmount: 0, isPaid: false,
    });
  });
});

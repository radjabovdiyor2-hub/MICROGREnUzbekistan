import { describe, it, expect, vi, beforeEach } from 'vitest';

// ══════════════════════════════════════════════════════════════════════
// Сотрудники: связка с Telegram.
//
// ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ И ПОЧЕМУ ИМЕННО ЭТО
//
// `employees.telegram_id` — колонка типа BigInt, и по ней продавец входит
// в кассу из Telegram без PIN (`/api/auth/telegram-staff`). Колонка была в
// схеме с самого начала, а заполнить её было негде: формы не существовало.
//
// Первая же попытка её заполнить вскрыла бы вторую беду: `BigInt` не
// сериализуется в JSON. Один заполненный Telegram ID — и `GET` роняет ВЕСЬ
// список сотрудников, включая тех, у кого связки нет. Ошибка молчаливая:
// пока колонка пустая, всё работает.
//
// Тесты идут против настоящего роута с подменённой Prisma: предмет
// проверки — сериализация и разбор ввода, а не база.
// ══════════════════════════════════════════════════════════════════════

const employeeFindMany = vi.fn();
const employeeCreate = vi.fn();
const employeeUpdate = vi.fn();
const employeeFindFirst = vi.fn();
const employeeFindUnique = vi.fn();
const movementFindMany = vi.fn();

vi.mock('@repo/database', () => ({
  prisma: {
    employee: {
      findMany: (...a: unknown[]) => employeeFindMany(...a),
      create: (...a: unknown[]) => employeeCreate(...a),
      update: (...a: unknown[]) => employeeUpdate(...a),
      findFirst: (...a: unknown[]) => employeeFindFirst(...a),
      // Проверка уникальности PIN — без неё создание падает пятисоткой,
      // и тест про Telegram ID проверял бы совсем другую поломку.
      findUnique: (...a: unknown[]) => employeeFindUnique(...a),
    },
    stockMovement: { findMany: (...a: unknown[]) => movementFindMany(...a) },
  },
}));

import { GET, POST, PUT } from './route';

/** Запрос к роуту: тело как есть, заголовки не нужны — доступ даёт middleware. */
function request(body: unknown) {
  return {
    json: async () => body,
    url: 'http://localhost:3000/api/inventory/employees',
    headers: new Headers(),
  } as unknown as Parameters<typeof POST>[0];
}

const BASE = {
  id: 'e1',
  name: 'Азиз',
  pin: '1234',
  phone: null,
  role: 'seller',
  department: null,
  city: 'samarqand',
  isActive: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  movementFindMany.mockResolvedValue([]);
  employeeFindFirst.mockResolvedValue(null);
  employeeFindUnique.mockResolvedValue(null);
});

describe('список сотрудников', () => {
  it('BigInt не роняет ответ — Telegram ID уходит строкой', async () => {
    // Ровно тот случай, который ломал список целиком: заполненная связка.
    employeeFindMany.mockResolvedValue([{ ...BASE, telegramId: BigInt('123456789012345') }]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.employees[0].telegramId).toBe('123456789012345');
    // PIN наружу не уходит никогда — он и есть ключ от кассы.
    expect(body.employees[0].pin).toBeUndefined();
  });

  it('без связки отдаёт null, а не строку «null»', async () => {
    employeeFindMany.mockResolvedValue([{ ...BASE, telegramId: null }]);

    const body = await (await GET()).json();
    expect(body.employees[0].telegramId).toBeNull();
  });
});

describe('приём Telegram ID', () => {
  it('строка цифр превращается в BigInt для базы', async () => {
    employeeCreate.mockResolvedValue({ ...BASE, telegramId: BigInt('777000111') });

    await POST(request({ name: 'Азиз', pin: '1234', telegramId: '777000111' }));

    expect(employeeCreate.mock.calls[0][0].data.telegramId).toBe(BigInt('777000111'));
  });

  it('мусор отвергается внятно, а не падает на вставке', async () => {
    const res = await POST(request({ name: 'Азиз', pin: '1234', telegramId: 'не-число' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('Telegram ID') });
    expect(employeeCreate).not.toHaveBeenCalled();
  });

  it('пустое поле правки снимает связку, а не оставляет её', async () => {
    employeeUpdate.mockResolvedValue({ ...BASE, telegramId: null });

    await PUT(request({ id: 'e1', telegramId: '' }));

    expect(employeeUpdate.mock.calls[0][0].data.telegramId).toBeNull();
  });

  it('отсутствие поля связку НЕ трогает', async () => {
    employeeUpdate.mockResolvedValue({ ...BASE, telegramId: BigInt('777') });

    // Правят телефон — привязка входа не должна пострадать.
    await PUT(request({ id: 'e1', phone: '+998901234567' }));

    expect('telegramId' in employeeUpdate.mock.calls[0][0].data).toBe(false);
  });

  it('занятый id называет причину, а не отвечает пятисоткой', async () => {
    employeeCreate.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        meta: { target: ['telegram_id'] },
      }),
    );

    const res = await POST(request({ name: 'Азиз', pin: '1234', telegramId: '777' }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('Telegram');
  });
});

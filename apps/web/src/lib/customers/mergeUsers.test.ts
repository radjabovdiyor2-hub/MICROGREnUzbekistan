import { describe, it, expect, vi, beforeEach } from 'vitest';

// ══════════════════════════════════════════════════════════════════════
// Слияние двух аккаунтов одного человека.
//
// Проверяется не «вызвалась ли функция», а два инварианта, каждый из
// которых уже был нарушен в первой версии:
//
//   1. ПОРЯДОК. `telegramId` и `phone` уникальны. Пока второй аккаунт жив,
//      перенести их на выжившего нельзя — Postgres отвечает 23505. Первая
//      версия обновляла выжившего ДО удаления и падала на живой базе,
//      хотя комментарий в самом файле предупреждал ровно об этом.
//
//   2. ДОЧЕРНИЕ СТРОКИ ПЕРЕД УДАЛЕНИЕМ. У `Order` и `GreenBoxSubscription`
//      нет каскада: удалить владельца раньше, чем перевешены заказы,
//      значит упереться во внешний ключ и потерять транзакцию целиком.
//
// Оба инварианта — про ПОСЛЕДОВАТЕЛЬНОСТЬ, поэтому мок пишет журнал
// вызовов, а тест читает его как ленту.
// ══════════════════════════════════════════════════════════════════════

// vi.mock поднимается выше объявлений модуля, поэтому журнал и заглушки
// создаются в vi.hoisted — иначе фабрика мока видит их до инициализации.
const H = vi.hoisted(() => {
  const journal: string[] = [];

  const OLDER = {
    id: 'older', createdAt: new Date('2026-01-10'), bonusPoints: 1200,
    phone: '+998901112233', telegramId: null as bigint | null,
    firstName: 'Азиз', lastName: null, username: null, avatarUrl: null,
  };
  const NEWER = {
    id: 'newer', createdAt: new Date('2026-06-01'), bonusPoints: 800,
    phone: null as string | null, telegramId: BigInt(555000111),
    firstName: 'Aziz', lastName: null, username: null, avatarUrl: null,
  };

  // У выжившего уже есть товар p1, у второго — p1 и p2: p1 обязан
  // схлопнуться, иначе @@unique([userId, productId]) уронит перенос.
  const table = (name: string) => ({
    findMany: async ({ where }: { where: { userId: string } }) =>
      where.userId === 'older'
        ? [{ id: name + '-1', productId: 'p1' }]
        : [{ id: name + '-2', productId: 'p1' }, { id: name + '-3', productId: 'p2' }],
    updateMany: async () => { journal.push(name + '.updateMany'); return { count: 1 }; },
    deleteMany: async () => { journal.push(name + '.deleteMany'); return { count: 1 }; },
  });

  const tx = {
    order: table('order'), address: table('address'), aiChat: table('aiChat'),
    greenBoxSubscription: table('greenBoxSubscription'), cartItem: table('cartItem'),
    favorite: table('favorite'), review: table('review'),
    customer: { updateMany: async () => ({ count: 0 }) },
    user: {
      update: async () => { journal.push('user.update'); return OLDER; },
      delete: async () => { journal.push('user.delete'); return NEWER; },
    },
  };

  return { journal, OLDER, NEWER, tx };
});

vi.mock('@repo/database', () => ({
  prisma: {
    user: {
      findMany: async () => [H.OLDER, H.NEWER],
      findUnique: async () => H.OLDER,
      update: H.tx.user.update,
    },
    $transaction: async (fn: (t: typeof H.tx) => Promise<void>) => fn(H.tx),
  },
  Prisma: {},
}));

import { mergeUsers } from './mergeUsers';

beforeEach(() => {
  H.journal.length = 0;
  vi.clearAllMocks();
});

describe('mergeUsers', () => {
  it('выживает СТАРШИЙ аккаунт, баллы складываются', async () => {
    // Референсный код старшего мог разойтись по друзьям — оставлять надо его.
    const result = await mergeUsers('newer', 'older');

    expect(result.keptId).toBe('older');
    expect(result.removedId).toBe('newer');
    expect(result.bonusPoints).toBe(2000);
  });

  it('второй аккаунт удаляется ПОСЛЕ переноса заказов', async () => {
    // У Order нет каскада: удаление владельца до переноса упрётся во
    // внешний ключ и опрокинет всю транзакцию.
    await mergeUsers('newer', 'older');

    expect(H.journal.indexOf('order.updateMany')).toBeLessThan(H.journal.indexOf('user.delete'));
  });

  it('поля выжившего обновляются ПОСЛЕ удаления второго', async () => {
    // phone и telegramId уникальны. Обновить выжившего, пока второй жив, —
    // это 23505 на unique-индексе. Именно так падала первая версия.
    await mergeUsers('newer', 'older');

    expect(H.journal.indexOf('user.delete')).toBeLessThan(H.journal.indexOf('user.update'));
  });

  it('переносит только те товары, которых у выжившего ещё нет', async () => {
    // `@@unique([userId, productId])`: слепой перенос p1 упал бы, потому
    // что он уже есть у выжившего. Переезжает только p2.
    await mergeUsers('newer', 'older');

    // Переезжает только p2, поэтому перенос у таблицы один; зачистка
    // остатка — тоже один раз.
    expect(H.journal.filter((call) => call === 'favorite.updateMany')).toHaveLength(1);
    expect(H.journal.filter((call) => call === 'favorite.deleteMany')).toHaveLength(1);
  });

  it('слияние аккаунта с самим собой ничего не делает', async () => {
    const result = await mergeUsers('older', 'older');

    expect(result.removedId).toBeNull();
    expect(H.journal).toHaveLength(0);
  });
});

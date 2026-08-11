import { describe, it, expect, vi, beforeEach } from 'vitest';

// ══════════════════════════════════════════════════════════════════════
// Начисление бонусов из админки.
//
// Раздел «Клиенты» писал новое значение в `customers.bonus_balance`, а
// тратятся баллы из `users.bonus_points`. Владелец начислял — клиент не
// видел и потратить не мог, а следующая синхронизация с витриной затирала
// правку обратно. Проверки закрепляют обратное: пишем ИСТОЧНИК, а без
// связки с аккаунтом витрины честно отказываем, ничего не меняя.
// ══════════════════════════════════════════════════════════════════════

const customerFindUnique = vi.fn();
const userFindUnique = vi.fn();
const userUpdate = vi.fn();
const customerUpdate = vi.fn();
const transaction = vi.fn((ops: unknown[]) => Promise.resolve(ops));

vi.mock('@repo/database', () => ({
  prisma: {
    customer: {
      findUnique: (...a: unknown[]) => customerFindUnique(...a),
      update: (...a: unknown[]) => customerUpdate(...a),
    },
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      update: (...a: unknown[]) => userUpdate(...a),
    },
    $transaction: (ops: unknown[]) => transaction(ops),
  },
}));

const { setCustomerBonus } = await import('./bonus');

describe('начисление бонусов клиенту', () => {
  beforeEach(() => {
    customerFindUnique.mockReset();
    userFindUnique.mockReset();
    userUpdate.mockReset();
    customerUpdate.mockReset();
    transaction.mockClear();
  });

  it('пишет баллы на аккаунт витрины и в зеркало CRM', async () => {
    customerFindUnique.mockResolvedValue({ webUserId: 'usr_1' });
    userFindUnique.mockResolvedValue({ id: 'usr_1' });

    const result = await setCustomerBonus(42, 12400);

    expect(result).toEqual({ ok: true, bonusBalance: 12400 });
    // Источник — users.bonusPoints: именно его списывает корзина.
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'usr_1' },
      data: { bonusPoints: 12400 },
    });
    // Зеркало CRM обновляется тем же значением и в той же транзакции.
    expect(customerUpdate).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { bonusBalance: 12400 },
    });
    expect(transaction).toHaveBeenCalledOnce();
  });

  it('без связки с витриной отказывает и ничего не меняет', async () => {
    customerFindUnique.mockResolvedValue({ webUserId: null });

    const result = await setCustomerBonus(42, 5000);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
    // Ни одной записи: молчаливая правка зеркала — ровно то, что чинится.
    expect(userUpdate).not.toHaveBeenCalled();
    expect(customerUpdate).not.toHaveBeenCalled();
  });

  it('отказывает, если аккаунт витрины удалён', async () => {
    // Покупатель мог воспользоваться правом на удаление данных
    // (api/users/data), и web_user_id указывает в пустоту.
    customerFindUnique.mockResolvedValue({ webUserId: 'usr_gone' });
    userFindUnique.mockResolvedValue(null);

    const result = await setCustomerBonus(42, 5000);

    expect(result.ok).toBe(false);
    expect(userUpdate).not.toHaveBeenCalled();
    expect(customerUpdate).not.toHaveBeenCalled();
  });

  it('не принимает отрицательный баланс', async () => {
    const result = await setCustomerBonus(42, -100);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
    expect(customerFindUnique).not.toHaveBeenCalled();
  });
});

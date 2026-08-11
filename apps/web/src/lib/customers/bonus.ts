import { prisma } from '@repo/database';

// ══════════════════════════════════════════════════════════════════════
// Начисление бонусов клиенту из админки.
//
// Раздел «Клиенты» писал новое значение в `customers.bonus_balance` — и на
// этом всё заканчивалось. Тратятся баллы из ДРУГОЙ колонки: оформление
// заказа списывает `users.bonus_points` (lib/orders/create.ts), профиль
// показывает её же. А `customers.bonus_balance` — зеркало, которое офис
// прямо перезаписывает значением витрины при каждом входе клиента
// (`customer_repo.upsert`: «bonus_balance — им владеет витрина»).
//
// То есть владелец начислял баллы, клиент их не видел и потратить не мог,
// а через некоторое время число молча возвращалось к прежнему.
//
// Теперь пишем источник и зеркало разом, в одной транзакции. Связки с
// аккаунтом витрины нет — отказываем вслух: начислить некуда, и сделать
// вид, что получилось, хуже, чем сказать правду.
// ══════════════════════════════════════════════════════════════════════

export type BonusResult =
  | { ok: true; bonusBalance: number }
  | { ok: false; error: string; status: number };

/**
 * Ставит клиенту новый баланс баллов.
 *
 * @param customerId карточка CRM
 * @param balance    новое значение (не приращение)
 */
export async function setCustomerBonus(
  customerId: number,
  balance: number,
): Promise<BonusResult> {
  if (!Number.isFinite(balance) || balance < 0) {
    return { ok: false, error: 'Баланс баллов не может быть отрицательным', status: 400 };
  }
  const points = Math.round(balance);

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { webUserId: true },
  });
  if (!customer) {
    return { ok: false, error: 'Клиент не найден', status: 404 };
  }

  if (!customer.webUserId) {
    return {
      ok: false,
      status: 409,
      error:
        'Карточка не связана с аккаунтом витрины — начислить баллы некуда. ' +
        'Связка появляется после первого заказа клиента через сайт или бота.',
    };
  }

  // Аккаунт мог быть удалён (право на удаление персональных данных —
  // api/users/data). Тогда web_user_id указывает в пустоту, и списывать
  // потом будет не с чего.
  const account = await prisma.user.findUnique({
    where: { id: customer.webUserId },
    select: { id: true },
  });
  if (!account) {
    return {
      ok: false,
      status: 409,
      error: 'Аккаунт витрины, связанный с карточкой, больше не существует',
    };
  }

  // Источник и зеркало — вместе. Порознь они разойдутся, и список клиентов
  // будет показывать одно число, а корзина списывать другое.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: account.id },
      data: { bonusPoints: points },
    }),
    prisma.customer.update({
      where: { id: customerId },
      data: { bonusBalance: points },
    }),
  ]);

  return { ok: true, bonusBalance: points };
}

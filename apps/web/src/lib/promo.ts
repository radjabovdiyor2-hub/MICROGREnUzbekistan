import { prisma } from '@repo/database';

// Promo validation shared by /api/promo (checkout preview) and /api/orders
// (authoritative re-check on submit).
export async function validatePromo(code: string, subtotal: number): Promise<
  { valid: true; discount: number; maxUses: number | null } | { valid: false; error: string }
> {
  const promo = await prisma.promoCode.findUnique({ where: { code } });
  if (!promo || !promo.isActive) {
    return { valid: false, error: 'Promokod topilmadi / Промокод не найден' };
  }
  if (promo.expiresAt && promo.expiresAt < new Date()) {
    return { valid: false, error: 'Promokod muddati tugagan / Срок действия истёк' };
  }
  if (promo.maxUses != null && promo.usedCount >= promo.maxUses) {
    return { valid: false, error: 'Promokod limiti tugagan / Лимит использований исчерпан' };
  }
  if (subtotal < promo.minSubtotal) {
    return {
      valid: false,
      error: `Kamida ${promo.minSubtotal.toLocaleString('ru-RU')} so'm buyurtma kerak / Минимальная сумма заказа ${promo.minSubtotal.toLocaleString('ru-RU')} сум`,
    };
  }
  const discount = promo.discountType === 'percent'
    ? Math.floor((subtotal * promo.value) / 100)
    : Math.min(promo.value, subtotal);
  return { valid: true, discount, maxUses: promo.maxUses };
}

/**
 * Занять одно использование кода. `false` — лимит уже исчерпан.
 *
 * Проверка и инкремент были разнесены: `validatePromo` читал `usedCount`, а
 * увеличивал его отдельный `update` ПОСЛЕ транзакции заказа. Между ними
 * помещался любой другой заказ, поэтому на коде с `maxUses: 100` и 99
 * использованиями два одновременных оформления оба видели «99 < 100», оба
 * получали скидку, и счётчик уходил в 101. Ошибку инкремента вдобавок глотал
 * `catch`: скидка выдана, счётчик не сдвинулся.
 *
 * Теперь это ОДИН условный UPDATE (`used_count < max_uses` в WHERE), как и
 * списание бонусов рядом: гонки нет, а `count === 0` честно означает «не
 * досталось».
 */
export async function consumePromo(code: string, maxUses: number | null): Promise<boolean> {
  const where = maxUses == null ? { code } : { code, usedCount: { lt: maxUses } };
  try {
    const claimed = await prisma.promoCode.updateMany({
      where,
      data: { usedCount: { increment: 1 } },
    });
    return claimed.count > 0;
  } catch (e) {
    console.error('Promo consume error:', e);
    return false;
  }
}

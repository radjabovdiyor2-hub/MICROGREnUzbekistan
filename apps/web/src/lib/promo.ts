import { prisma } from '@repo/database';

// Promo validation shared by /api/promo (checkout preview) and /api/orders
// (authoritative re-check on submit).
export async function validatePromo(code: string, subtotal: number): Promise<
  { valid: true; discount: number } | { valid: false; error: string }
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
  return { valid: true, discount };
}

// Consume one use of the code (called after the order is created).
export async function consumePromo(code: string) {
  try {
    await prisma.promoCode.update({ where: { code }, data: { usedCount: { increment: 1 } } });
  } catch (e) {
    console.error('Promo consume error (order still created):', e);
  }
}

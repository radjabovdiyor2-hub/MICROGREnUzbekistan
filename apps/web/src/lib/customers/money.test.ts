import { describe, it, expect } from 'vitest';

import { hidesMoney, maskSum, sumLabel } from './money';

// ══════════════════════════════════════════════════════════════════════
// Кто видит суммы клиента.
//
// Главное здесь — что скрытая сумма это `null`, а не ноль. Ноль — это
// утверждение «закупок не было», и продавец, глядя на «0 сум» у
// постоянного клиента, сделает из этого вывод и поедет продавать заново.
// ══════════════════════════════════════════════════════════════════════

describe('кому прятать', () => {
  it('владелец видит суммы', () => {
    expect(hidesMoney('ADMIN')).toBe(false);
  });

  it('продавец и агроном — нет', () => {
    expect(hidesMoney('SELLER')).toBe(true);
    expect(hidesMoney('GROWER')).toBe(true);
    expect(hidesMoney('CUSTOMER')).toBe(true);
  });

  it('бот видит: он ходит по секрету за отчётами офиса', () => {
    // Сессии у него нет вовсе. Спрятать от него значило бы сломать сводки,
    // которые считает офис.
    expect(hidesMoney(undefined)).toBe(false);
    expect(hidesMoney(null)).toBe(false);
  });
});

describe('скрытая сумма', () => {
  it('это null, а не ноль', () => {
    expect(maskSum(4_200_000, true)).toBeNull();
    expect(maskSum(0, true)).toBeNull();
  });

  it('владельцу отдаётся как есть, включая настоящий ноль', () => {
    expect(maskSum(4_200_000, false)).toBe(4_200_000);
    expect(maskSum(0, false)).toBe(0);
  });
});

describe('подпись', () => {
  it('прочерк вместо числа, когда смотреть не положено', () => {
    expect(sumLabel(null, 'ru')).toBe('—');
    expect(sumLabel(null, 'uz')).toBe('—');
  });

  it('настоящий ноль остаётся нулём, а не прочерком', () => {
    // Клиент, который завёлся, но ещё не купил, — это рабочая ситуация, и
    // она обязана отличаться от «вам не показываем».
    expect(sumLabel(0, 'ru')).toContain('0');
  });

  it('разряды разделены — семизначные суммы иначе не читаются', () => {
    expect(sumLabel(4_200_000, 'ru')).toMatch(/4\s?200\s?000/);
  });
});

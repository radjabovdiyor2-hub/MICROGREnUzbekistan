import { describe, expect, it } from 'vitest';
import {
  cartTotal, formatQty, formatQtyWithUnit, isDivisible, isValidQty,
  lineTotal, MAX_QUANTITY, normalizeQty, quantitySchema, stepFor,
} from './qty';

describe('шаг набора по единице', () => {
  it('весовой товар набирается по 0.1', () => {
    expect(stepFor('кг')).toBe(0.1);
    expect(stepFor('100 г')).toBe(0.1);
    expect(stepFor(' КГ ')).toBe(0.1);
  });

  it('штучный — по одному', () => {
    expect(stepFor('шт')).toBe(1);
    expect(stepFor('лоток')).toBe(1);
  });

  it('«лоток» не принимается за литры', () => {
    // Поиск вхождением подстроки нашёл бы «л» внутри «лоток» и предложил бы
    // продать полподноса. Сопоставление точное.
    expect(isDivisible('лоток')).toBe(false);
    expect(isDivisible('л')).toBe(true);
  });

  it('незнакомая единица — штучная, а не дробная', () => {
    expect(stepFor('коробка')).toBe(1);
    expect(stepFor(null)).toBe(1);
    expect(stepFor(undefined)).toBe(1);
  });
});

describe('нормализация количества', () => {
  it('снимает хвост double при наборе кнопками', () => {
    // 0.1 + 0.2 в double = 0.30000000000000004
    expect(normalizeQty(0.1 + 0.2)).toBe(0.3);
    expect(normalizeQty(1.3)).toBe(1.3);
  });

  it('режет до двух знаков — столько же в колонке и в зеркале CRM', () => {
    expect(normalizeQty(1.234)).toBe(1.23);
  });
});

describe('проверка количества', () => {
  it('1.3 — честное количество и не отбивается допуском double', () => {
    expect(isValidQty(1.3)).toBe(true);
    expect(isValidQty(0.1)).toBe(true);
    expect(isValidQty(2)).toBe(true);
  });

  it('три знака не проходят', () => {
    expect(isValidQty(1.234)).toBe(false);
  });

  it('ноль, минус, бесконечность и опечатка по потолку не проходят', () => {
    expect(isValidQty(0)).toBe(false);
    expect(isValidQty(-1)).toBe(false);
    expect(isValidQty(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidQty(Number.NaN)).toBe(false);
    expect(isValidQty(MAX_QUANTITY + 1)).toBe(false);
  });

  it('zod-схема повторяет те же правила', () => {
    expect(quantitySchema.safeParse(1.3).success).toBe(true);
    expect(quantitySchema.safeParse(1.234).success).toBe(false);
    expect(quantitySchema.safeParse(0).success).toBe(false);
  });
});

describe('сумма позиции', () => {
  it('1.3 кг по 13 000 — ровно 16 900, без хвоста double', () => {
    // 1.3 * 13000 в double = 16900.000000000002
    expect(lineTotal(13_000, 1.3)).toBe(16_900);
  });

  it('результат всегда целый — деньги в сумах', () => {
    expect(Number.isInteger(lineTotal(15_000, 0.1))).toBe(true);
    expect(lineTotal(15_000, 0.1)).toBe(1_500);
    expect(Number.isInteger(lineTotal(13_333, 1.3))).toBe(true);
  });

  it('чек складывает УЖЕ округлённые позиции', () => {
    // Округление общей суммы в конце дало бы другой ответ, и чек разошёлся
    // бы со складским журналом, где каждая позиция лежит отдельной строкой.
    const items = [
      { price: 13_001, quantity: 1.5 }, // 19 501.5 → 19 502
      { price: 13_001, quantity: 1.5 },
    ];
    expect(cartTotal(items)).toBe(19_502 * 2); // 39 004
    // А округление ОБЩЕЙ суммы дало бы 39 003 — на сум меньше. Расхождение
    // маленькое ровно до тех пор, пока позиций две, а не двести.
    expect(Math.round(13_001 * 1.5 * 2)).toBe(39_003);
    expect(cartTotal(items)).not.toBe(Math.round(13_001 * 1.5 * 2));
  });
});

describe('вывод количества', () => {
  it('без хвоста «.00»', () => {
    expect(formatQty(2)).toBe('2');
    expect(formatQty(1.3)).toBe('1.3');
    expect(formatQty(1.0)).toBe('1');
  });

  it('с единицей, а без единицы — только число', () => {
    expect(formatQtyWithUnit(1.3, 'кг')).toBe('1.3 кг');
    expect(formatQtyWithUnit(2, null)).toBe('2');
  });
});

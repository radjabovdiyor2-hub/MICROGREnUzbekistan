import { describe, expect, it } from 'vitest';
import { allocateDiscount } from './discount';
import { lineTotal } from '@/lib/qty';

// ══════════════════════════════════════════════════════════════════════
// Скидка на чек разносится по позициям, потому что хранить её негде:
// чек — это набор движений склада, а выручка кассы считается как
// `quantity × salePrice`. Главное свойство, которое здесь проверяется:
// сумма движений после разнесения РАВНА объявленному итогу чека. Если бы
// они разошлись, отчёт и чек показывали бы разные деньги за одну продажу.
// ══════════════════════════════════════════════════════════════════════

const sumOf = (lines: { price: number }[], src: { quantity: number }[]) =>
  lines.reduce((acc, line, i) => acc + lineTotal(line.price, src[i].quantity), 0);

describe('без скидки', () => {
  it('цены не меняются', () => {
    const lines = [{ price: 15_000, quantity: 1.3 }];
    const result = allocateDiscount(lines, null);
    expect(result.lines[0].price).toBe(15_000);
    expect(result.applied).toBe(0);
    expect(result.net).toBe(result.gross);
  });
});

describe('процент', () => {
  it('уменьшает цену позиции, а не только итог', () => {
    const lines = [{ price: 15_000, quantity: 2 }];
    const result = allocateDiscount(lines, { type: 'percent', value: 10, reason: 'опт' });
    expect(result.lines[0].price).toBe(13_500);
    expect(result.gross).toBe(30_000);
    expect(result.net).toBe(27_000);
    expect(result.applied).toBe(3_000);
  });

  it('сто процентов не уводят цену в ноль или минус', () => {
    // Ноль сделал бы движение неотличимым от списания: продажа опознаётся
    // в отчётах именно по наличию цены продажи.
    const lines = [{ price: 15_000, quantity: 1 }];
    const result = allocateDiscount(lines, { type: 'percent', value: 100, reason: 'подарок' });
    expect(result.lines[0].price).toBeGreaterThanOrEqual(1);
  });
});

describe('фиксированная сумма', () => {
  it('разносится пропорционально позициям', () => {
    const lines = [{ price: 10_000, quantity: 1 }, { price: 30_000, quantity: 1 }];
    const result = allocateDiscount(lines, { type: 'fixed', value: 4_000, reason: 'округлили' });
    // Доли 1:3 — тысяча с первой позиции, три с второй.
    expect(result.lines[0].price).toBe(9_000);
    expect(result.lines[1].price).toBe(27_000);
    expect(result.applied).toBe(4_000);
  });

  it('скидка больше чека не уводит итог в минус', () => {
    const lines = [{ price: 10_000, quantity: 1 }];
    const result = allocateDiscount(lines, { type: 'fixed', value: 999_999, reason: 'ошибка' });
    expect(result.net).toBeGreaterThanOrEqual(0);
    expect(result.applied).toBeLessThanOrEqual(result.gross);
  });
});

describe('сумма движений сходится с итогом чека', () => {
  const cases: { name: string; lines: { price: number; quantity: number }[]; value: number; type: 'percent' | 'fixed' }[] = [
    { name: 'дробные количества и процент', lines: [{ price: 15_000, quantity: 1.3 }, { price: 25_000, quantity: 0.7 }], value: 7, type: 'percent' },
    { name: 'дробные количества и сумма', lines: [{ price: 15_000, quantity: 1.3 }, { price: 25_000, quantity: 0.7 }], value: 5_000, type: 'fixed' },
    { name: 'одна дробная позиция', lines: [{ price: 13_333, quantity: 1.3 }], value: 1_000, type: 'fixed' },
    { name: 'три позиции', lines: [{ price: 9_900, quantity: 0.3 }, { price: 12_000, quantity: 2.5 }, { price: 7_500, quantity: 1.1 }], value: 13, type: 'percent' },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const result = allocateDiscount(c.lines, { type: c.type, value: c.value, reason: 'тест' });
      // Это и есть инвариант: то, что пишется в движения, и то, что
      // объявлено итогом чека, — одно и то же число.
      expect(sumOf(result.lines, c.lines)).toBe(result.net);
      expect(result.gross - result.applied).toBe(result.net);
    });
  }

  it('фактическая скидка может отличаться от запрошенной — и это видно', () => {
    // Цена за единицу целая, количество дробное: «минус 1 000 с 1.3 кг» —
    // это 769.23 сума с килограмма, и точно выразить это нельзя. Возвращаем
    // то, что произошло на самом деле, а не то, что просили.
    const lines = [{ price: 13_333, quantity: 1.3 }];
    const result = allocateDiscount(lines, { type: 'fixed', value: 1_000, reason: 'тест' });
    expect(result.requested).toBe(1_000);
    expect(Math.abs(result.applied - result.requested)).toBeLessThan(10);
    expect(sumOf(result.lines, lines)).toBe(result.net);
  });
});

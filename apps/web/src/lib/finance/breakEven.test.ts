import { describe, it, expect } from 'vitest';
import { computeBreakEven } from './breakEven';

describe('computeBreakEven', () => {
  it('считает точку по доле маржи', () => {
    // Маржа 60%: из каждой тысячи выручки на покрытие аренды идёт 600.
    // Значит на 1 200 000 постоянных нужно 2 000 000 выручки.
    const r = computeBreakEven({ fixedCosts: 1_200_000, revenue: 2_500_000, variableCosts: 1_000_000 });

    expect(r.marginRate).toBeCloseTo(0.6, 10);
    expect(r.revenueNeeded).toBeCloseTo(2_000_000, 6);
    expect(r.covered).toBe(true);
    expect(r.gap).toBeCloseTo(-500_000, 6);
  });

  it('показывает нехватку положительным числом', () => {
    const r = computeBreakEven({ fixedCosts: 1_200_000, revenue: 1_000_000, variableCosts: 400_000 });

    expect(r.covered).toBe(false);
    expect(r.gap).toBeGreaterThan(0);
  });

  it('на границе считает точку пройденной', () => {
    const r = computeBreakEven({ fixedCosts: 600_000, revenue: 1_000_000, variableCosts: 400_000 });

    expect(r.revenueNeeded).toBeCloseTo(1_000_000, 6);
    expect(r.covered).toBe(true);
    expect(r.gap).toBeCloseTo(0, 6);
  });

  // Без выручки доля маржи не определена. Показать здесь ноль означало бы
  // сказать «продаём по себестоимости», хотя не продаём вообще.
  it('без выручки не выдумывает долю маржи', () => {
    const r = computeBreakEven({ fixedCosts: 900_000, revenue: 0, variableCosts: 0 });

    expect(r.marginRate).toBeNull();
    expect(r.revenueNeeded).toBeNull();
    expect(r.gap).toBeNull();
    expect(r.covered).toBe(false);
  });

  // Самый важный случай: при отрицательной марже точки НЕ СУЩЕСТВУЕТ.
  // Формула fixed / marginRate дала бы здесь отрицательное «нужно продать
  // на минус миллион» — число, которое выглядит как ответ и им не является.
  it('при продаже ниже себестоимости не обещает достижимой точки', () => {
    const r = computeBreakEven({ fixedCosts: 500_000, revenue: 1_000_000, variableCosts: 1_300_000 });

    expect(r.marginRate).toBeLessThan(0);
    expect(r.revenueNeeded).toBeNull();
    expect(r.covered).toBe(false);
  });

  it('продажа ровно по себестоимости тоже не даёт точки', () => {
    const r = computeBreakEven({ fixedCosts: 500_000, revenue: 1_000_000, variableCosts: 1_000_000 });

    expect(r.marginRate).toBe(0);
    expect(r.revenueNeeded).toBeNull();
  });

  it('без постоянных расходов точка достигается первой же продажей', () => {
    const r = computeBreakEven({ fixedCosts: 0, revenue: 100_000, variableCosts: 40_000 });

    expect(r.revenueNeeded).toBe(0);
    expect(r.covered).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { computeOrder, DEFAULT_UNIT_COST } from './printPricing';

describe('magazine/printPricing · computeOrder', () => {
  it('считает revenue/cost/margin по копиям и ценам', () => {
    // 100 копий × 8000 продажа, 4000 себестоимость
    expect(computeOrder(100, 8000, 4000)).toEqual({
      revenue: 800_000,
      cost: 400_000,
      margin: 400_000,
    });
  });

  it('использует DEFAULT_UNIT_COST, если себестоимость не передана', () => {
    expect(DEFAULT_UNIT_COST).toBe(4000);
    const r = computeOrder(10, 10_000);
    expect(r.cost).toBe(10 * DEFAULT_UNIT_COST);
    expect(r.margin).toBe(10 * 10_000 - 10 * DEFAULT_UNIT_COST);
  });

  it('нулевой тираж → все нули', () => {
    expect(computeOrder(0, 8000, 4000)).toEqual({ revenue: 0, cost: 0, margin: 0 });
  });

  it('отрицательная маржа при цене ниже себестоимости', () => {
    const r = computeOrder(50, 3000, 4000);
    expect(r.margin).toBe(50 * 3000 - 50 * 4000);
    expect(r.margin).toBeLessThan(0);
  });
});

import { describe, expect, it } from 'vitest';

import { CARRY_LIMIT, mergeStops, planProgress, splitCarry } from './planCarry';

const stop = (customerId: number, interactionId: number | null, carriedTimes = 0) => ({
  customerId,
  interactionId,
  carriedTimes,
});

describe('splitCarry', () => {
  it('переносит только остановки без отметки', () => {
    const { carry } = splitCarry([stop(1, 10), stop(2, null), stop(3, null)]);
    expect(carry.map((s) => s.customerId)).toEqual([2, 3]);
  });

  it('заехали и не застали — это состоявшийся визит, не переносим', () => {
    // «Не застал» кладёт отметку так же, как «договорились»: исход разный,
    // поездка состоялась. Повторять её завтра незачем.
    const { carry } = splitCarry([stop(1, 99)]);
    expect(carry).toHaveLength(0);
  });

  it('исчерпавшие лимит уходят отдельным списком, а не молча', () => {
    const { carry, exhausted } = splitCarry([
      stop(1, null, CARRY_LIMIT),
      stop(2, null, CARRY_LIMIT - 1),
    ]);
    expect(carry.map((s) => s.customerId)).toEqual([2]);
    expect(exhausted.map((s) => s.customerId)).toEqual([1]);
  });
});

describe('mergeStops', () => {
  it('перенесённые едут перед свежими', () => {
    const plan = mergeStops([stop(7, null, 1)], [3, 4]);
    expect(plan.map((s) => s.customerId)).toEqual([7, 3, 4]);
    expect(plan[0].origin).toBe('carry');
    expect(plan[1].origin).toBe('plan');
  });

  it('самые залежавшиеся идут первыми среди перенесённых', () => {
    const plan = mergeStops([stop(1, null, 1), stop(2, null, 3), stop(3, null, 2)], []);
    expect(plan.map((s) => s.customerId)).toEqual([2, 3, 1]);
  });

  it('счётчик переносов растёт', () => {
    const plan = mergeStops([stop(5, null, 2)], []);
    expect(plan[0].carriedTimes).toBe(3);
  });

  it('клиент, попавший и в перенос, и в расписание, ставится один раз', () => {
    const plan = mergeStops([stop(9, null, 1)], [9, 10]);
    expect(plan.map((s) => s.customerId)).toEqual([9, 10]);
    expect(plan[0].origin).toBe('carry');
  });

  it('порядок нумеруется подряд без пропусков', () => {
    const plan = mergeStops([stop(1, null)], [2, 3]);
    expect(plan.map((s) => s.orderIndex)).toEqual([0, 1, 2]);
  });

  it('пустой день даёт пустой план', () => {
    expect(mergeStops([], [])).toEqual([]);
  });
});

describe('planProgress', () => {
  it('считает по ссылке на отметку, а не по числу клиентов', () => {
    expect(planProgress([stop(1, 5), stop(2, null), stop(3, 7)])).toEqual({ done: 2, total: 3 });
  });

  it('двойной заезд к одному клиенту не сбивает счёт', () => {
    // Утром не застали, вечером застали: две отметки, но остановка одна,
    // и закрыта она ровно одной из них.
    expect(planProgress([stop(1, 42)])).toEqual({ done: 1, total: 1 });
  });
});

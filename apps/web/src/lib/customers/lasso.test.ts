import { describe, expect, it } from 'vitest';

import {
  MIN_LASSO_POINTS,
  isUsableLasso,
  pointInPolygon,
  selectInside,
  thinPath,
} from './lasso';

/** Квадрат 100x100 из достаточного числа точек, чтобы пройти порог. */
const square = Array.from({ length: 12 }, (_, i) => {
  const side = Math.floor(i / 3);
  const t = (i % 3) / 3;
  if (side === 0) return { x: t * 100, y: 0 };
  if (side === 1) return { x: 100, y: t * 100 };
  if (side === 2) return { x: 100 - t * 100, y: 100 };
  return { x: 0, y: 100 - t * 100 };
});

describe('pointInPolygon', () => {
  it('точка внутри квадрата', () => {
    expect(pointInPolygon({ x: 50, y: 50 }, square)).toBe(true);
  });

  it('точка снаружи', () => {
    expect(pointInPolygon({ x: 150, y: 50 }, square)).toBe(false);
    expect(pointInPolygon({ x: -5, y: 50 }, square)).toBe(false);
  });

  it('вырожденный контур не содержит ничего', () => {
    expect(pointInPolygon({ x: 0, y: 0 }, [])).toBe(false);
    expect(pointInPolygon({ x: 0, y: 0 }, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false);
  });

  it('контур замыкается сам — последнюю точку с первой соединять не надо', () => {
    // Человек отпускает палец где придётся; требовать попадания в начало
    // значит не получить ни одного замкнутого контура.
    const open = [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
    ];
    expect(pointInPolygon({ x: 50, y: 50 }, open)).toBe(true);
  });

  it('вогнутый контур: выемка снаружи', () => {
    // Подкова: середина выреза не внутри.
    const horseshoe = [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 },
      { x: 70, y: 100 }, { x: 70, y: 30 }, { x: 30, y: 30 },
      { x: 30, y: 100 }, { x: 0, y: 100 },
    ];
    expect(pointInPolygon({ x: 50, y: 70 }, horseshoe)).toBe(false);
    expect(pointInPolygon({ x: 50, y: 15 }, horseshoe)).toBe(true);
  });
});

describe('isUsableLasso', () => {
  it('случайный тап обводкой не считается', () => {
    const tap = Array.from({ length: MIN_LASSO_POINTS + 2 }, (_, i) => ({ x: i * 0.5, y: i * 0.5 }));
    expect(isUsableLasso(tap)).toBe(false);
  });

  it('короткий росчерк тоже', () => {
    expect(isUsableLasso([{ x: 0, y: 0 }, { x: 200, y: 0 }])).toBe(false);
  });

  it('черта без высоты не выделяет ничего', () => {
    const line = Array.from({ length: 20 }, (_, i) => ({ x: i * 10, y: 0 }));
    expect(isUsableLasso(line)).toBe(false);
  });

  it('нормальная обводка проходит', () => {
    expect(isUsableLasso(square)).toBe(true);
  });
});

describe('thinPath', () => {
  it('убирает точки ближе порога', () => {
    const dense = Array.from({ length: 50 }, (_, i) => ({ x: i, y: 0 }));
    const thin = thinPath(dense, 10);
    expect(thin.length).toBeLessThan(dense.length);
    expect(thin[0]).toEqual({ x: 0, y: 0 });
  });

  it('последняя точка сохраняется — она задаёт замыкающую сторону', () => {
    const dense = Array.from({ length: 50 }, (_, i) => ({ x: i, y: 0 }));
    expect(thinPath(dense, 10).at(-1)).toEqual({ x: 49, y: 0 });
  });

  it('короткий путь не трогает', () => {
    const path = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    expect(thinPath(path)).toEqual(path);
  });
});

describe('selectInside', () => {
  const items = [
    { item: 1, at: { x: 50, y: 50 } },
    { item: 2, at: { x: 150, y: 50 } },
    { item: 3, at: { x: 10, y: 90 } },
  ];

  it('берёт только то, что внутри', () => {
    expect(selectInside(items, square)).toEqual([1, 3]);
  });

  it('негодная обводка не выделяет ничего', () => {
    // Важно именно ничего, а не всё: иначе случайный тап стёр бы
    // собранный объезд и заменил его всей картой.
    expect(selectInside(items, [{ x: 0, y: 0 }, { x: 2, y: 2 }])).toEqual([]);
  });

  it('пустая карта — пустой ответ', () => {
    expect(selectInside([], square)).toEqual([]);
  });
});

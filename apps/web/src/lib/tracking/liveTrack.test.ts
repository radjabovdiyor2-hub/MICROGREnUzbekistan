import { describe, expect, it } from 'vitest';

import { chronological } from './liveTrack';

// ══════════════════════════════════════════════════════════════════════
// Разворот выдачи «сначала свежие» в путь и текущую точку.
//
// Арифметика тут на три строки, но ошибка в ней не видна ничем: карта
// просто показывает старую позицию как текущую. Поэтому проверяется
// отдельно от двери — без Prisma и без сети.
// ══════════════════════════════════════════════════════════════════════

const at = (min: number) => ({ at: new Date(Date.UTC(2026, 8, 11, 12, min)) });

/** Что отдаёт база при `orderBy: at desc`: свежие впереди. */
const newestFirst = (count: number) =>
  Array.from({ length: count }, (_, i) => at(59 - i));

describe('chronological', () => {
  it('текущая точка — первая из выдачи, а не последняя из куска', () => {
    const rows = newestFirst(10);
    const slice = chronological(rows, 4);
    expect(slice.last).toBe(rows[0]);
  });

  it('путь разворачивается по ходу движения', () => {
    const slice = chronological(newestFirst(5), 5);
    const times = slice.track.map((r) => r.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('лишняя строка в путь не идёт, но об обрезке говорит', () => {
    // Дверь просит `max + 1` именно ради этого различия.
    const slice = chronological(newestFirst(401), 400);
    expect(slice.track).toHaveLength(400);
    expect(slice.trimmed).toBe(true);
  });

  it('ровно предел — это не обрезка', () => {
    expect(chronological(newestFirst(400), 400).trimmed).toBe(false);
  });

  it('пусто — это «точек нет», а не точка в нуле', () => {
    const slice = chronological([], 400);
    expect(slice.last).toBeNull();
    expect(slice.track).toEqual([]);
    expect(slice.trimmed).toBe(false);
  });

  it('исходный массив не переворачивается на месте', () => {
    // `last` вычисляется по первому элементу выдачи: перевернув её на
    // месте, мы сломали бы вызывающего, который держит ту же ссылку.
    const rows = newestFirst(3);
    const first = rows[0];
    chronological(rows, 3);
    expect(rows[0]).toBe(first);
  });
});

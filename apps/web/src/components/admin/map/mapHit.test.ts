import { describe, it, expect } from 'vitest';

import {
  HIT_PX_COARSE,
  HIT_PX_FINE,
  hitBox,
  hitRadius,
  isCluster,
  pickHit,
  sortHits,
  stackedHits,
  type HitCandidate,
} from './mapHit';

// ══════════════════════════════════════════════════════════════════════
// Попадание пальцем.
//
// Проверяется то, что глазами ловится только в поле: что тап рядом с
// точкой её находит, что маленькая точка на краю большого кластера
// побеждает кластер, и что стопка заведений в одном здании не
// разрешается угадыванием.
// ══════════════════════════════════════════════════════════════════════

const at = (x: number, y: number) => ({ x, y });

function point(id: number, x: number, y: number): HitCandidate {
  return { id, layer: 'customers-points', at: at(x, y) };
}

function cluster(id: number, x: number, y: number): HitCandidate {
  return { id, layer: 'customers-clusters', at: at(x, y), clusterId: id };
}

describe('рамка попадания', () => {
  it('под палец шире, чем под курсор', () => {
    expect(hitRadius(true)).toBe(HIT_PX_COARSE);
    expect(hitRadius(false)).toBe(HIT_PX_FINE);
    expect(hitRadius(true)).toBeGreaterThan(hitRadius(false));
  });

  it('курсору тоже даётся запас: попасть в шесть пикселей мышью — не подарок', () => {
    expect(hitRadius(false)).toBeGreaterThan(0);
  });

  it('строится вокруг касания, а не от него', () => {
    expect(hitBox(at(100, 50), 12)).toEqual([
      [88, 38],
      [112, 62],
    ]);
  });
});

describe('выбор ближайшего', () => {
  it('пустая рамка — это клик по карте, а не по точке', () => {
    expect(pickHit([], at(10, 10))).toBeNull();
  });

  it('берёт ближайший центр, а не первый в списке', () => {
    const far = point(1, 100, 100);
    const near = point(2, 12, 10);
    expect(pickHit([far, near], at(10, 10))?.id).toBe(2);
  });

  // Ради этого случая расстояние и считается по ЦЕНТРУ. Рамка возвращает
  // кластер, даже если задела только его край, — а человек целился в
  // точку, которая на этом краю стоит.
  it('маленькая точка на краю большого кластера побеждает кластер', () => {
    const hits = [cluster(900, 40, 0), point(7, 1, 0)];
    expect(pickHit(hits, at(0, 0))?.id).toBe(7);
  });

  it('в середину кластера — значит кластер', () => {
    const hits = [cluster(900, 0, 0), point(7, 30, 0)];
    expect(isCluster(pickHit(hits, at(0, 0)))).toBe(true);
  });

  it('при равном расстоянии порядок определён, а не случаен', () => {
    const a: HitCandidate = { id: 1, layer: 'customers-prospects', at: at(5, 0) };
    const b: HitCandidate = { id: 2, layer: 'customers-points', at: at(-5, 0) };
    // Один и тот же ответ независимо от порядка на входе.
    expect(pickHit([a, b], at(0, 0))?.id).toBe(2);
    expect(pickHit([b, a], at(0, 0))?.id).toBe(2);
  });

  it('не портит исходный массив', () => {
    const hits = [point(1, 100, 100), point(2, 1, 1)];
    sortHits(hits, at(0, 0));
    expect(hits.map((h) => h.id)).toEqual([1, 2]);
  });

  it('обычная точка кластером не считается', () => {
    expect(isCluster(point(1, 0, 0))).toBe(false);
    expect(isCluster(null)).toBe(false);
  });
});

describe('стопка точек под пальцем', () => {
  it('одна точка — не стопка, спрашивать не о чем', () => {
    expect(stackedHits([point(1, 0, 0)], at(0, 0))).toEqual([]);
  });

  it('две в одном здании — стопка, выбирает человек', () => {
    const stack = stackedHits([point(1, 0, 0), point(2, 2, 2)], at(0, 0));
    expect(stack.map((h) => h.id).sort()).toEqual([1, 2]);
  });

  // Иначе окно выбора выскакивало бы на каждом втором тапе: в рамку 12px
  // попадает и сосед, в которого никто не целился.
  it('сосед в стороне в стопку не идёт — он просто рядом', () => {
    expect(stackedHits([point(1, 0, 0), point(2, 11, 0)], at(0, 0))).toEqual([]);
  });

  it('кластеры в стопку не попадают: у них своё поведение', () => {
    const hits = [cluster(900, 0, 0), cluster(901, 1, 1), point(5, 2, 0)];
    expect(stackedHits(hits, at(0, 0))).toEqual([]);
  });

  it('цель и клиент в одной точке — тоже стопка: белое пятно такой же адрес', () => {
    const hits = [
      point(1, 0, 0),
      { id: -3, layer: 'customers-prospects', at: at(1, 0) },
    ];
    expect(stackedHits(hits, at(0, 0))).toHaveLength(2);
  });
});

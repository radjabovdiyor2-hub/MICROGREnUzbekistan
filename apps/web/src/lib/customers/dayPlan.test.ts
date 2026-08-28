import { describe, expect, it } from 'vitest';

import {
  buildDayPlan,
  isPlannable,
  planScore,
  COOLDOWN_DAYS,
  MAX_REACH_KM,
  planMix,
  type PlanCandidate,
} from './dayPlan';

// ══════════════════════════════════════════════════════════════════════
// План объезда на сегодня.
//
// Проверяются РЕШЕНИЯ, а не сортировка. Плохой план не падает — он просто
// отправляет продавца не туда, и понять это можно только вечером, когда
// день потрачен.
//
// Три ошибки, ради которых написан этот файл:
//   1. план из одних ближайших — день в соседнем квартале;
//   2. план из одних просроченных — день в дороге через город;
//   3. повторный заезд к тому, у кого были вчера.
// ══════════════════════════════════════════════════════════════════════

const HERE = { latitude: 39.6542, longitude: 66.9597 };

/** Точка в километрах к северу от старта: 0.009° широты ≈ 1 км. */
const at = (km: number, over: Partial<PlanCandidate> = {}): PlanCandidate => ({
  id: over.id ?? Math.round(km * 1000),
  name: over.name ?? `точка ${km} км`,
  latitude: HERE.latitude + km * 0.009,
  longitude: HERE.longitude,
  state: over.state ?? 'healthy',
  overdueRatio: over.overdueRatio ?? null,
  lastVisitDays: over.lastVisitDays ?? null,
  ...over,
});

describe('кого вообще берём в день', () => {
  it('вчерашний заезд не повторяем', () => {
    expect(isPlannable(at(1, { lastVisitDays: 1 }), HERE)).toBe(false);
    expect(isPlannable(at(1, { lastVisitDays: COOLDOWN_DAYS }), HERE)).toBe(true);
  });

  it('к кому не ездили ни разу — берём', () => {
    expect(isPlannable(at(1, { lastVisitDays: null }), HERE)).toBe(true);
  });

  it('за пределом дня не берём — это отдельный выезд', () => {
    expect(isPlannable(at(MAX_REACH_KM + 5), HERE)).toBe(false);
  });

  it('без старта расстояние не ограничивает: неизвестно, откуда ехать', () => {
    expect(isPlannable(at(100), null)).toBe(true);
  });
});

describe('вес: срочность против расстояния', () => {
  it('под угрозой важнее здорового на том же расстоянии', () => {
    const risky = planScore(at(2, { state: 'at_risk' }), HERE);
    const fine = planScore(at(2, { state: 'healthy' }), HERE);
    expect(risky).toBeGreaterThan(fine);
  });

  it('ближний просроченный идёт раньше дальнего просроченного', () => {
    const near = planScore(at(1, { state: 'at_risk' }), HERE);
    const far = planScore(at(20, { state: 'at_risk' }), HERE);
    expect(near).toBeGreaterThan(far);
  });

  it('дальний просроченный обходит ближнего здорового', () => {
    // Иначе план вырождается в «объехать соседний квартал».
    const farRisky = planScore(at(12, { state: 'at_risk', overdueRatio: 3 }), HERE);
    const nearFine = planScore(at(1, { state: 'healthy' }), HERE);
    expect(farRisky).toBeGreaterThan(nearFine);
  });

  it('просрочка усиливает, но не отменяет расстояние', () => {
    const overdueFar = planScore(at(24, { state: 'slipping', overdueRatio: 9 }), HERE);
    const overdueNear = planScore(at(2, { state: 'slipping', overdueRatio: 9 }), HERE);
    expect(overdueNear).toBeGreaterThan(overdueFar);
  });

  it('потенциальный выше здорового: в эту дверь ещё не заходили', () => {
    expect(planScore(at(3, { state: 'prospect' }), HERE)).toBeGreaterThan(
      planScore(at(3, { state: 'healthy' }), HERE),
    );
  });
});

describe('сборка плана', () => {
  it('берёт не больше отведённого', () => {
    const many = Array.from({ length: 20 }, (_, i) => at(i + 1, { state: 'at_risk', id: i + 1 }));
    expect(buildDayPlan(many, HERE, 5)).toHaveLength(5);
  });

  it('порядок — ближайший следующий, а не по весу', () => {
    // Три под угрозой на 1, 5 и 3 км: по весу первым был бы ближайший, но
    // порядок объезда обязан идти 1 → 3 → 5, а не 1 → 5 → 3.
    const plan = buildDayPlan(
      [
        at(1, { state: 'at_risk', id: 1, name: 'первый' }),
        at(5, { state: 'at_risk', id: 5, name: 'дальний' }),
        at(3, { state: 'at_risk', id: 3, name: 'средний' }),
      ],
      HERE,
    );
    expect(plan.map((p) => p.name)).toEqual(['первый', 'средний', 'дальний']);
  });

  it('отсеянные не попадают в план', () => {
    const plan = buildDayPlan(
      [
        at(1, { state: 'at_risk', id: 1, lastVisitDays: 0, name: 'были вчера' }),
        at(2, { state: 'at_risk', id: 2, name: 'годится' }),
      ],
      HERE,
    );
    expect(plan.map((p) => p.name)).toEqual(['годится']);
  });

  it('некого объезжать — пустой план, а не выдуманный', () => {
    expect(buildDayPlan([], HERE)).toEqual([]);
    expect(buildDayPlan([at(1, { lastVisitDays: 0 })], HERE)).toEqual([]);
  });

  it('без старта план всё равно собирается', () => {
    // Геолокация могла не ответить. План от первой точки хуже, чем от
    // человека, но лучше, чем никакого.
    const plan = buildDayPlan([at(4, { state: 'at_risk', id: 4 }), at(1, { state: 'at_risk', id: 1 })], null);
    expect(plan).toHaveLength(2);
  });
});

describe('planMix', () => {
  const point = (id: number) => ({ id, name: `точка ${id}`, latitude: 39.65, longitude: 66.97 });
  const candidate = (id: number, state: string) => ({
    ...point(id),
    state,
    overdueRatio: null,
    lastVisitDays: null,
  });

  it('считает новые двери и обслуживание раздельно', () => {
    const mix = planMix(
      [point(1), point(2), point(3)],
      [candidate(1, 'prospect'), candidate(2, 'healthy'), candidate(3, 'prospect')],
    );

    expect(mix.fresh).toBe(2);
    expect(mix.existing).toBe(1);
  });

  // «Новый» — это уже состоявшийся клиент с заказами, а не новая дверь.
  // Счесть его поиском значило бы отчитаться о росте, которого не было.
  it('не считает поиском заход к состоявшемуся клиенту', () => {
    const mix = planMix([point(1)], [candidate(1, 'new')]);

    expect(mix.fresh).toBe(0);
    expect(mix.existing).toBe(1);
  });

  // Точка, о которой карта ничего не знает, не может быть записана в
  // новые двери: иначе счётчик поиска раздувается неизвестностью.
  it('точку без состояния относит к обслуживанию, а не к поиску', () => {
    const mix = planMix([point(1)], []);

    expect(mix.fresh).toBe(0);
    expect(mix.existing).toBe(1);
  });

  it('на пустом плане отдаёт нули', () => {
    expect(planMix([], [])).toEqual({ fresh: 0, existing: 0 });
  });
});


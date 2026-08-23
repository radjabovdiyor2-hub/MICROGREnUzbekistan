import { describe, it, expect } from 'vitest';

import {
  NEARBY_LIMIT,
  NEARBY_MAX_KM,
  formatKm,
  nearestPoints,
  type NearbyPoint,
} from './nearby';

// ══════════════════════════════════════════════════════════════════════
// «Кто рядом».
//
// Вопрос полевой: приехал к одному — кто ещё в квартале. Проверяется то,
// что ломается молча: что сама точка не попадает в свой же список, что
// «рядом» имеет потолок, и что метры не превращаются в доли километра.
// ══════════════════════════════════════════════════════════════════════

const SAMARKAND = { latitude: 39.6542, longitude: 66.9597 };

/** Точка со сдвигом на `km` к северу — широта меняется ровно линейно. */
function northOf(id: number, km: number): NearbyPoint {
  return {
    id,
    name: `точка ${id}`,
    latitude: SAMARKAND.latitude + km / 111.32,
    longitude: SAMARKAND.longitude,
  };
}

const origin = { id: 1, name: 'откуда', ...SAMARKAND };

describe('nearestPoints', () => {
  it('пусто на входе — пусто на выходе, а не падение', () => {
    expect(nearestPoints([], origin)).toEqual([]);
  });

  // Расстояние до себя — ноль, и без исключения по id точка возглавляла бы
  // собственный список соседей.
  it('сама точка в свой список соседей не попадает', () => {
    const points = [{ id: 1, name: 'откуда', ...SAMARKAND }, northOf(2, 0.5)];
    expect(nearestPoints(points, origin).map((h) => h.point.id)).toEqual([2]);
  });

  it('сортирует по возрастанию расстояния, а не по порядку в массиве', () => {
    const points = [northOf(4, 1.5), northOf(2, 0.2), northOf(3, 0.9)];
    expect(nearestPoints(points, origin).map((h) => h.point.id)).toEqual([2, 3, 4]);
  });

  // Без потолка список всегда отдавал бы шесть штук, и на окраине в него
  // попадало бы то, до чего полчаса езды.
  it('дальше потолка — уже не «рядом»', () => {
    const points = [northOf(2, NEARBY_MAX_KM + 0.5), northOf(3, 0.3)];
    expect(nearestPoints(points, origin).map((h) => h.point.id)).toEqual([3]);
  });

  it('потолок задаётся, а не зашит', () => {
    const points = [northOf(2, 5)];
    expect(nearestPoints(points, origin, 6, 10)).toHaveLength(1);
    expect(nearestPoints(points, origin, 6, 1)).toHaveLength(0);
  });

  it('список ограничен — это подсказка, а не выгрузка района', () => {
    const points = Array.from({ length: 20 }, (_, i) => northOf(i + 2, 0.05 * (i + 1)));
    expect(nearestPoints(points, origin)).toHaveLength(NEARBY_LIMIT);
  });

  it('расстояние возвращается вместе с точкой — его же и показываем', () => {
    const [hit] = nearestPoints([northOf(2, 1)], origin);
    expect(hit.km).toBeGreaterThan(0.9);
    expect(hit.km).toBeLessThan(1.1);
  });
});

describe('formatKm', () => {
  // «0.3 км» требует пересчёта в уме за рулём, «300 м» — нет.
  it('ближе километра говорит метрами', () => {
    expect(formatKm(0.3)).toBe('300 м');
    expect(formatKm(0.85)).toBe('850 м');
  });

  it('округляет метры до полусотни — точнее гаверсинус тут и не знает', () => {
    expect(formatKm(0.312)).toBe('300 м');
    expect(formatKm(0.33)).toBe('350 м');
  });

  // Ноль метров читался бы как «вы на месте», хотя точка соседняя.
  it('совсем близкое не схлопывается в ноль', () => {
    expect(formatKm(0.001)).toBe('50 м');
    expect(formatKm(0)).toBe('50 м');
  });

  it('от километра и дальше — километрами с одним знаком', () => {
    expect(formatKm(1)).toBe('1.0 км');
    expect(formatKm(1.44)).toBe('1.4 км');
  });
});

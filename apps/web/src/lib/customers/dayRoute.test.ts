import { describe, it, expect } from 'vitest';

import {
  MAX_STOPS,
  addStop,
  distanceKm,
  moveStop,
  orderByProximity,
  parseStops,
  removeStop,
  routeLengthKm,
  type RoutePoint,
} from './dayRoute';

// ══════════════════════════════════════════════════════════════════════
// Объезд на день.
//
// Проверяется то, что ломается тихо: расстояние по сырой разнице координат
// (на широте Самарканда градус долготы на четверть короче градуса широты),
// потерянный хвост при переполнении ссылки и мусор из localStorage.
// ══════════════════════════════════════════════════════════════════════

function p(id: number, lat: number, lon: number): RoutePoint {
  return { id, name: `Точка ${id}`, latitude: lat, longitude: lon };
}

// Регистан и Гур-Эмир — около километра друг от друга.
const REGISTAN = p(1, 39.6547, 66.9758);
const GUR_EMIR = p(2, 39.6483, 66.9689);

describe('расстояние', () => {
  it('считает по большому кругу, а не по разнице координат', () => {
    const km = distanceKm(REGISTAN, GUR_EMIR);
    expect(km).toBeGreaterThan(0.8);
    expect(km).toBeLessThan(1.2);
  });

  it('до себя — ноль, и без NaN от корня из отрицательного', () => {
    expect(distanceKm(REGISTAN, REGISTAN)).toBe(0);
  });

  it('градус долготы короче градуса широты — иначе «ближайший» врёт', () => {
    // На широте 39,65° градус долготы примерно 85 км против 111 км у
    // широты. Сравнение по сырой дельте назвало бы их равными, и объезд
    // регулярно заворачивал бы не туда.
    const north = distanceKm(REGISTAN, p(3, 40.6547, 66.9758));
    const east = distanceKm(REGISTAN, p(4, 39.6547, 67.9758));
    expect(north).toBeGreaterThan(east);
  });
});

describe('порядок по близости', () => {
  it('ведёт к ближайшей следующей от старта', () => {
    const far = p(3, 39.9, 67.3);
    const stops = [far, GUR_EMIR, REGISTAN];
    const ordered = orderByProximity(stops, REGISTAN);
    expect(ordered.map((s) => s.id)).toEqual([1, 2, 3]);
  });

  it('без стартовой точки идёт от первой выбранной', () => {
    // Подставлять центр города значило бы строить маршрут от места, где
    // никого нет, — и первая остановка оказывалась бы случайной.
    const ordered = orderByProximity([p(3, 39.9, 67.3), GUR_EMIR, REGISTAN]);
    expect(ordered[0].id).toBe(3);
  });

  it('не теряет и не плодит остановки', () => {
    const stops = [REGISTAN, GUR_EMIR, p(3, 39.9, 67.3), p(4, 39.7, 66.9)];
    const ordered = orderByProximity(stops, REGISTAN);
    expect(ordered).toHaveLength(4);
    expect(new Set(ordered.map((s) => s.id))).toEqual(new Set([1, 2, 3, 4]));
  });

  it('порядок по близости не длиннее произвольного', () => {
    const stops = [p(1, 39.6, 66.9), p(2, 39.9, 67.3), p(3, 39.62, 66.92), p(4, 39.88, 67.28)];
    const from = p(0, 39.6, 66.9);
    expect(routeLengthKm(orderByProximity(stops, from), from)).toBeLessThanOrEqual(
      routeLengthKm(stops, from),
    );
  });

  it('одна остановка и пустой список не ломаются', () => {
    expect(orderByProximity([])).toEqual([]);
    expect(orderByProximity([REGISTAN])).toEqual([REGISTAN]);
  });
});

describe('набор остановок', () => {
  it('дубль не добавляется — по нему уже едем', () => {
    const once = addStop([], REGISTAN);
    expect(addStop(once, REGISTAN)).toHaveLength(1);
  });

  it('потолок держится: ссылка молча теряет хвост, а не растягивается', () => {
    let stops: RoutePoint[] = [];
    for (let i = 1; i <= MAX_STOPS + 5; i++) stops = addStop(stops, p(i, 39.6 + i / 100, 66.9));
    expect(stops).toHaveLength(MAX_STOPS);
  });

  it('удаление убирает ровно одну', () => {
    const stops = addStop(addStop([], REGISTAN), GUR_EMIR);
    expect(removeStop(stops, 1).map((s) => s.id)).toEqual([2]);
    expect(removeStop(stops, 99)).toHaveLength(2);
  });

  it('сдвиг у края списка — не ошибка, просто некуда', () => {
    const stops = [REGISTAN, GUR_EMIR];
    expect(moveStop(stops, 1, -1)).toEqual(stops);
    expect(moveStop(stops, 2, 1)).toEqual(stops);
    expect(moveStop(stops, 1, 1).map((s) => s.id)).toEqual([2, 1]);
  });
});

describe('чтение сохранённого', () => {
  it('переживает мусор в хранилище', () => {
    // Там лежит то, что записали вчера, — то есть что угодно.
    expect(parseStops(null)).toEqual([]);
    expect(parseStops('не json')).toEqual([]);
    expect(parseStops('{"а":1}')).toEqual([]);
    expect(parseStops('[1,2,3]')).toEqual([]);
  });

  it('выбрасывает записи без координат, а не рисует их в нуле', () => {
    // Точка с latitude: null уехала бы в Гвинейский залив.
    const raw = JSON.stringify([
      { id: 1, name: 'Целая', latitude: 39.6, longitude: 66.9 },
      { id: 2, name: 'Без координат', latitude: null, longitude: null },
    ]);
    expect(parseStops(raw).map((s) => s.id)).toEqual([1]);
  });

  it('не пускает больше потолка даже из хранилища', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      name: 'x',
      latitude: 39.6,
      longitude: 66.9,
    }));
    expect(parseStops(JSON.stringify(many))).toHaveLength(MAX_STOPS);
  });
});

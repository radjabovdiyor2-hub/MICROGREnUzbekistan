import { describe, it, expect } from 'vitest';

import {
  DEFAULT_BOUNDS,
  SAMARKAND,
  SEARCH_LIMIT,
  TASHKENT,
  boundsOfFeatures,
  searchPoints,
} from './mapFeature';
import type { MapFeature } from './mapFeature';

// ══════════════════════════════════════════════════════════════════════
// Стартовый вид карты.
//
// Ферма в Самарканде, а целевые заведения — и там, и в Ташкенте. Карта,
// центрированная на одном городе, прячет половину дела: владелец открывал
// раздел и не понимал, куда делись клиенты, — они были за краем экрана.
// ══════════════════════════════════════════════════════════════════════

function at(lon: number, lat: number, name = 'x', id = 1): MapFeature {
  return {
    type: 'Feature',
    id,
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: {
      n: name, t: 'b2b', st: 'healthy', sp: 0, oc: 0,
      dl: null, ov: null, vt: 'low', d: null, ct: 'restaurant', au: null,
      gs: null, ph: null, ad: null, gp: null, k: 'customer',
    },
  };
}

describe('рамка по умолчанию', () => {
  it('охватывает оба города', () => {
    expect(DEFAULT_BOUNDS).toEqual([SAMARKAND, TASHKENT]);
  });

  it('юго-западный угол действительно юго-западнее северо-восточного', () => {
    // Перепутанные местами углы MapLibre принимает молча и показывает
    // изнанку мира — проверяем порядок явно.
    const [[swLon, swLat], [neLon, neLat]] = DEFAULT_BOUNDS;
    expect(swLon).toBeLessThan(neLon);
    expect(swLat).toBeLessThan(neLat);
  });
});

describe('boundsOfFeatures', () => {
  it('без точек рамки нет — родитель покажет оба города', () => {
    expect(boundsOfFeatures([])).toBeNull();
  });

  it('охватывает все точки', () => {
    const box = boundsOfFeatures([at(66.96, 39.65), at(69.24, 41.31), at(68.0, 40.5)]);
    expect(box).toEqual([[66.96, 39.65], [69.24, 41.31]]);
  });

  it('одна точка даёт вырожденную рамку, а не ошибку', () => {
    // Нулевая площадь допустима: зум ограничивает FIT_MAX_ZOOM.
    expect(boundsOfFeatures([at(69.24, 41.31)])).toEqual([[69.24, 41.31], [69.24, 41.31]]);
  });

  it('порядок точек на рамку не влияет', () => {
    const a = boundsOfFeatures([at(69.24, 41.31), at(66.96, 39.65)]);
    const b = boundsOfFeatures([at(66.96, 39.65), at(69.24, 41.31)]);
    expect(a).toEqual(b);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Поиск по карте.
//
// Найти конкретное заведение среди тысячи точек можно было только
// фильтрами — сузив карту до района и разглядывая её глазами.
// ══════════════════════════════════════════════════════════════════════

describe('поиск по карте', () => {
  const points = [
    at(66.97, 39.65, 'Плов Центр', 1),
    at(66.98, 39.66, 'Sam Ped Kolledj', 2),
    at(66.99, 39.67, 'ПЛОВХОНА У ДРУГА', 3),
  ];

  it('находит независимо от регистра и раскладки', () => {
    // Заведения записаны и латиницей, и кириллицей, и вперемешку: поиск,
    // чувствительный к регистру, не нашёл бы «ПЛОВХОНА» по «плов».
    expect(searchPoints(points, 'плов').map((p) => p.id)).toEqual([1, 3]);
    expect(searchPoints(points, 'KOLLEDJ').map((p) => p.id)).toEqual([2]);
    expect(searchPoints(points, '  Центр ').map((p) => p.id)).toEqual([1]);
  });

  it('одна буква — не запрос: она совпадает почти со всем', () => {
    expect(searchPoints(points, 'п')).toEqual([]);
    expect(searchPoints(points, '')).toEqual([]);
    expect(searchPoints(points, '   ')).toEqual([]);
  });

  it('список ограничен — это подсказка, а не выгрузка', () => {
    const many = Array.from({ length: 30 }, (_, i) => at(66, 39, `Кафе ${i}`, i + 1));
    expect(searchPoints(many, 'кафе')).toHaveLength(SEARCH_LIMIT);
  });

  it('отдаёт готовую точку с координатами — по ней сразу подлетать', () => {
    const [found] = searchPoints(points, 'Kolledj');
    expect(found.longitude).toBe(66.98);
    expect(found.latitude).toBe(39.66);
    expect(found.name).toBe('Sam Ped Kolledj');
  });
});

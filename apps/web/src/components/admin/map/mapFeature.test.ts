import { describe, it, expect } from 'vitest';

import { DEFAULT_BOUNDS, SAMARKAND, TASHKENT, boundsOfFeatures } from './mapFeature';
import type { MapFeature } from './mapFeature';

// ══════════════════════════════════════════════════════════════════════
// Стартовый вид карты.
//
// Ферма в Самарканде, а целевые заведения — и там, и в Ташкенте. Карта,
// центрированная на одном городе, прячет половину дела: владелец открывал
// раздел и не понимал, куда делись клиенты, — они были за краем экрана.
// ══════════════════════════════════════════════════════════════════════

function at(lon: number, lat: number): MapFeature {
  return {
    type: 'Feature',
    id: 1,
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: {
      n: 'x', t: 'b2b', st: 'healthy', sp: 0, oc: 0,
      dl: null, ov: null, vt: 'low', d: null, ct: 'restaurant', au: null,
      gs: null, k: 'customer',
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

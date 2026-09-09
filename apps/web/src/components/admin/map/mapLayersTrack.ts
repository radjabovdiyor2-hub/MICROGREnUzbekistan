import type { TokenColors } from './useTokenColors';

// ══════════════════════════════════════════════════════════════════════
// Слой дня в поле: пройденный путь и стоянки.
//
// Отдельно от `mapLayersDelivery` по той же границе, по которой тот
// отделён от клиентов: другой источник, другое время жизни (день собирают
// вечером, а рейс живёт часы) и другая роль — это отчёт, а не задание.
//
// ЛИНИЯ РАЗОРВАНА ТАМ, ГДЕ МОЛЧАЛА СВЯЗЬ. Сплошная линия через полгорода
// утверждает, что человек там ехал. На деле он мог стоять в подвале с
// мёртвым телефоном. Разрыв рисуется пунктиром и серым: это «мы не
// знаем», а не «он срезал».
// ══════════════════════════════════════════════════════════════════════

export const SOURCE_TRACK = 'field-track';
export const LAYER_TRACK_LINE = 'field-track-line';
export const LAYER_TRACK_GAP = 'field-track-gap';
export const LAYER_TRACK_STAYS = 'field-track-stays';

export function buildTrackLayers(c: TokenColors) {
  return [
    {
      // Сам путь. Сплошной и фирменного цвета — это то, что известно.
      id: LAYER_TRACK_LINE,
      type: 'line' as const,
      source: SOURCE_TRACK,
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['!', ['get', 'gap']]],
      layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
      paint: { 'line-color': c.brand, 'line-width': 3, 'line-opacity': 0.75 },
    },
    {
      // Разрыв связи. Серым и пунктиром — цвет здесь не обвиняет.
      id: LAYER_TRACK_GAP,
      type: 'line' as const,
      source: SOURCE_TRACK,
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['get', 'gap']],
      layout: { 'line-cap': 'butt' as const, 'line-join': 'round' as const },
      paint: {
        'line-color': c.muted,
        'line-width': 2,
        'line-opacity': 0.5,
        'line-dasharray': [1, 2],
      },
    },
    {
      // Стоянка. Радиус растёт с длительностью: сорок минут у закупщика
      // должны быть видны крупнее, чем пятиминутный заезд, — иначе день
      // читается как ровная цепочка одинаковых точек.
      id: LAYER_TRACK_STAYS,
      type: 'circle' as const,
      source: SOURCE_TRACK,
      filter: ['==', ['get', 'kind'], 'stay'],
      paint: {
        // Подтверждённое человеком и выведенное машиной различаются на
        // вид — тот же принцип, что в ленте дня.
        'circle-color': ['case', ['==', ['get', 'confirmedBy'], 'manual'], c.brand, c.muted],
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['coalesce', ['get', 'dwellSec'], 0],
          0, 6,
          900, 9,
          3600, 14,
        ],
        'circle-stroke-color': c.card,
        'circle-stroke-width': 2,
        'circle-opacity': 0.9,
      },
    },
  ];
}

export interface TrackPoint {
  at: string;
  latitude: number;
  longitude: number;
}

export interface TrackStayPoint {
  id: number;
  latitude: number | null;
  longitude: number | null;
  dwellSec: number | null;
  confirmedBy: string;
}

/**
 * Разрыв, после которого отрезок рисуется пунктиром.
 *
 * То же значение, что у `GAP_MS` в `lib/tracking/ping.ts`, и по той же
 * причине: там такой отрезок не идёт в длину пути, здесь — не выдаётся за
 * известную дорогу. Разъехаться этим двум числам нельзя, иначе карта и
 * сумма километров начнут рассказывать разное.
 */
export const TRACK_GAP_MS = 5 * 60 * 1000;

/**
 * GeoJSON дня: путь отрезками плюс точки стоянок.
 *
 * Отрезками, а не одной линией: у каждого своя пометка «это разрыв», и
 * одной геометрией её не выразить.
 */
export function buildTrackCollection(track: TrackPoint[], stays: TrackStayPoint[]) {
  const features: GeoJSON.Feature[] = [];

  for (let i = 1; i < track.length; i += 1) {
    const from = track[i - 1];
    const to = track[i];
    const gap = new Date(to.at).getTime() - new Date(from.at).getTime() > TRACK_GAP_MS;
    features.push({
      type: 'Feature',
      properties: { gap },
      geometry: {
        type: 'LineString',
        coordinates: [
          [from.longitude, from.latitude],
          [to.longitude, to.latitude],
        ],
      },
    });
  }

  for (const stay of stays) {
    // Стоянка без пина у клиента на карту не попадает: рисовать её
    // некуда, а выдумывать координату нельзя.
    if (stay.latitude === null || stay.longitude === null) continue;
    features.push({
      type: 'Feature',
      properties: {
        kind: 'stay',
        stayId: stay.id,
        dwellSec: stay.dwellSec ?? 0,
        confirmedBy: stay.confirmedBy,
      },
      geometry: { type: 'Point', coordinates: [stay.longitude, stay.latitude] },
    });
  }

  return { type: 'FeatureCollection' as const, features };
}

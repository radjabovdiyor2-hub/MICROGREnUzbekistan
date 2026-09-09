import { describe, expect, it } from 'vitest';

import { GAP_MS } from '@/lib/tracking/ping';

import {
  TRACK_GAP_MS,
  buildTrackCollection,
  buildTrackLayers,
  type TrackPoint,
  type TrackStayPoint,
} from './mapLayersTrack';

const T0 = new Date('2026-09-09T09:00:00').getTime();

function point(min: number, lon = 66.96): TrackPoint {
  return { at: new Date(T0 + min * 60_000).toISOString(), latitude: 39.654, longitude: lon };
}

function stay(over: Partial<TrackStayPoint> = {}): TrackStayPoint {
  return {
    id: 1,
    latitude: 39.654,
    longitude: 66.96,
    dwellSec: 600,
    confirmedBy: 'manual',
    ...over,
  };
}

describe('TRACK_GAP_MS', () => {
  it('совпадает с порогом, по которому считается длина пути', () => {
    // Разъедься эти два числа — и карта показала бы сплошную линию там,
    // где километры в неё не засчитаны. Два экрана одного дня начали бы
    // рассказывать разное.
    expect(TRACK_GAP_MS).toBe(GAP_MS);
  });
});

describe('buildTrackCollection', () => {
  it('строит отрезок между соседними точками', () => {
    const fc = buildTrackCollection([point(0), point(1, 66.97)], []);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry.type).toBe('LineString');
    expect(fc.features[0].properties?.gap).toBe(false);
  });

  it('долгое молчание помечает отрезок разрывом', () => {
    const fc = buildTrackCollection([point(0), point(TRACK_GAP_MS / 60_000 + 5, 67.01)], []);
    expect(fc.features[0].properties?.gap).toBe(true);
  });

  it('одна точка — линии нет, и это не ошибка', () => {
    expect(buildTrackCollection([point(0)], []).features).toEqual([]);
    expect(buildTrackCollection([], []).features).toEqual([]);
  });

  it('стоянка становится точкой со своей длительностью', () => {
    const fc = buildTrackCollection([], [stay({ dwellSec: 2400 })]);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties?.kind).toBe('stay');
    expect(fc.features[0].properties?.dwellSec).toBe(2400);
  });

  it('стоянка без пина на карту не попадает — координату не выдумываем', () => {
    const fc = buildTrackCollection([], [stay({ latitude: null, longitude: null })]);
    expect(fc.features).toEqual([]);
  });

  it('пустая длительность не ломает радиус: ноль вместо null', () => {
    const fc = buildTrackCollection([], [stay({ dwellSec: null })]);
    expect(fc.features[0].properties?.dwellSec).toBe(0);
  });
});

describe('buildTrackLayers', () => {
  const colors = {
    success: '#0a0', error: '#a00', muted: '#999', brand: '#0b0', card: '#fff',
  } as Parameters<typeof buildTrackLayers>[0];

  it('разрыв и путь — разные слои с разным цветом', () => {
    const [line, gap] = buildTrackLayers(colors);
    expect(line.paint['line-color']).toBe(colors.brand);
    // Серый, а не красный: разрыв связи — это «мы не знаем», а не улика.
    expect(gap.paint['line-color']).toBe(colors.muted);
    expect(gap.paint['line-color']).not.toBe(colors.error);
  });

  it('подтверждённая и выведенная стоянки различимы на вид', () => {
    const stays = buildTrackLayers(colors)[2];
    expect(JSON.stringify(stays.paint['circle-color'])).toContain('manual');
  });
});

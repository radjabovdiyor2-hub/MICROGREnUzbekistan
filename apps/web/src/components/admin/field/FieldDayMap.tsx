'use client';

import { useEffect, useRef } from 'react';
import {
  Map as MapLibreMap,
  NavigationControl,
  type AddLayerObject,
  type GeoJSONSource,
} from 'maplibre-gl';

import { appliedTheme, styleUrl } from '../map/mapLayers';
import {
  SOURCE_TRACK,
  buildTrackCollection,
  buildTrackLayers,
  type TrackPoint,
  type TrackStayPoint,
} from '../map/mapLayersTrack';
import { useTokenColors } from '../map/useTokenColors';

// ══════════════════════════════════════════════════════════════════════
// Карта одного дня.
//
// ПОЧЕМУ СВОЙ ЭКЗЕМПЛЯР, А НЕ СЛОЙ НА КАРТЕ КЛИЕНТОВ. Та карта отвечает на
// вопрос «куда ехать» и живёт с фильтрами, поиском, объездом и продажей с
// точки. Здесь другой вопрос — «как прошёл вторник», — и вешать на неё
// ещё и выбор сотрудника с датой значит утяжелить рабочий инструмент ради
// разбора, который делают раз в неделю.
//
// Стиль и цвета берутся из тех же модулей: разъехаться карте объезда и
// карте отчёта нельзя, иначе один и тот же город выглядит двумя разными.
// ══════════════════════════════════════════════════════════════════════

export function FieldDayMap({
  track,
  stays,
}: {
  track: TrackPoint[];
  stays: TrackStayPoint[];
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const ready = useRef(false);
  const colors = useTokenColors();

  // Свежие данные держим в ref: эффект инициализации должен выполниться
  // один раз, а данные к нему приезжают позже.
  const latest = useRef({ track, stays, colors });
  // Обновляем ПОСЛЕ отрисовки, а не во время: запись в ref прямо в теле
  // рендера ломает конкурентный режим. Так же сделано в CustomerMapCanvas.
  useEffect(() => {
    latest.current = { track, stays, colors };
  });

  useEffect(() => {
    const node = container.current;
    if (!node || map.current) return;

    let instance: MapLibreMap;
    try {
      instance = new MapLibreMap({
        container: node,
        // Тема из DOM, а не литералом: захардкоженный светлый стиль
        // слепил бы глаза тому, у кого включена тёмная.
        style: styleUrl(appliedTheme()),
        center: [66.9597, 39.654],
        zoom: 11,
        attributionControl: { compact: true },
      });
    } catch (error) {
      // Конструктор бросает СИНХРОННО без WebGL. Перехватываем по той же
      // причине, что и карта клиентов: иначе исключение уносит всю вкладку,
      // а лента дня читается и без карты.
      console.error('[field-day] карта не поднялась:', error);
      return;
    }
    map.current = instance;
    instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');

    instance.on('load', () => {
      const { track: t, stays: s, colors: c } = latest.current;
      instance.addSource(SOURCE_TRACK, {
        type: 'geojson',
        data: buildTrackCollection(t, s) as unknown as GeoJSON.FeatureCollection,
      });
      // Приведение — как в `mapEvents.ts` у слоёв доставки: спецификация
      // слоя в типах maplibre описана кортежами выражений, вывести которые
      // из литерала TypeScript не может.
      for (const layer of buildTrackLayers(c)) {
        instance.addLayer(layer as unknown as AddLayerObject);
      }
      ready.current = true;
      fitToTrack(instance, t);
    });

    return () => {
      ready.current = false;
      map.current = null;
      instance.remove();
    };
  }, []);

  // Данные меняются при смене сотрудника или даты — источник обновляем,
  // карту не пересоздаём.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready.current) return;
    const source = instance.getSource(SOURCE_TRACK) as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(buildTrackCollection(track, stays) as unknown as GeoJSON.FeatureCollection);
    fitToTrack(instance, track);
  }, [track, stays]);

  return (
    <div
      ref={container}
      style={{
        height: 320,
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        marginBottom: 'var(--space-4)',
        background: 'var(--bg-secondary)',
      }}
    />
  );
}

/** Показать день целиком. Пустой трек рамку не трогает. */
function fitToTrack(instance: MapLibreMap, track: TrackPoint[]) {
  if (track.length === 0) return;
  let minLat = track[0].latitude;
  let maxLat = track[0].latitude;
  let minLon = track[0].longitude;
  let maxLon = track[0].longitude;
  for (const p of track) {
    if (p.latitude < minLat) minLat = p.latitude;
    if (p.latitude > maxLat) maxLat = p.latitude;
    if (p.longitude < minLon) minLon = p.longitude;
    if (p.longitude > maxLon) maxLon = p.longitude;
  }
  instance.fitBounds(
    [
      [minLon, minLat],
      [maxLon, maxLat],
    ],
    // maxZoom нужен для дня, проведённого на одной улице: без него карта
    // ныряет до отдельных домов и теряет город вокруг.
    { padding: 40, maxZoom: 15, duration: 0 },
  );
}

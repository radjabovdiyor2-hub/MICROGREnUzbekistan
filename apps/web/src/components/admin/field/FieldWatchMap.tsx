'use client';

import { useEffect, useRef, useState } from 'react';
// БЕЗ ЭТИХ ДВУХ ИМПОРТОВ КАРТА — ПУСТОЙ ПРЯМОУГОЛЬНИК, и оба раза молча.
//
// Стили: без `.maplibregl-canvas { position: absolute }` холст остаётся
// нулевого размера — контейнер виден, тайлов нет, ошибок тоже нет.
//
// Воркер: адрес разборщика векторных тайлов задаётся один раз на
// приложение побочным эффектом модуля. Без него MapLibre вычисляет его от
// `import.meta.url`, получает 404, и воркер умирает МОЛЧА — стиль и
// TileJSON приходят главным потоком, а тайлов и шрифтов нет.
import 'maplibre-gl/dist/maplibre-gl.css';
import '@/lib/map/worker';
import {
  Map as MapLibreMap,
  NavigationControl,
  type AddLayerObject,
  type GeoJSONSource,
} from 'maplibre-gl';

import { webglMissing } from '@/lib/map/webgl';

import { appliedTheme, styleUrl } from '../map/mapLayers';
import {
  FIT_TRACK, SOURCE_TRACK, buildTrackCollection, buildTrackLayers, trackBounds,
  type TrackPoint,
} from '../map/mapLayersTrack';
import { useTokenColors } from '../map/useTokenColors';

// ══════════════════════════════════════════════════════════════════════
// Карта слежения за одним человеком.
//
// ОТ КАРТЫ ДНЯ ОТЛИЧАЕТСЯ ОДНИМ: она едет за точкой. День показывают
// целиком и рамку больше не трогают; здесь наоборот — смотрят на то, где
// человек сейчас, и карта обязана держать его в виду.
//
// НО КАМЕРА УСТУПАЕТ ПАЛЬЦУ. Как только владелец сдвинул карту рукой,
// слежение выключается: карта, которая дёргается обратно на каждую новую
// точку, — самый быстрый способ, чтобы экраном перестали пользоваться.
// Вернуть слежение можно кнопкой снаружи.
//
// МАСШТАБ ПОДБИРАЕТСЯ ОДИН РАЗ. Подгонять рамку на каждое обновление
// значит за день отъехать на весь город — от точки, ради которой открыли.
// ══════════════════════════════════════════════════════════════════════

export function FieldWatchMap({
  track,
  center,
  following,
  onUserMoved,
}: {
  track: TrackPoint[];
  /** Куда смотреть. `null` — точек нет, ехать некуда. */
  center: [number, number] | null;
  following: boolean;
  onUserMoved: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const ready = useRef(false);
  const fitted = useRef(false);
  const colors = useTokenColors();
  const [failure, setFailure] = useState(() =>
    webglMissing() ? 'не поднялась — похоже, в браузере выключен WebGL' : '',
  );

  const latest = useRef({ track, colors, onUserMoved });
  useEffect(() => {
    latest.current = { track, colors, onUserMoved };
  });

  useEffect(() => {
    const node = container.current;
    if (!node || map.current) return;

    let instance: MapLibreMap;
    try {
      instance = new MapLibreMap({
        container: node,
        style: styleUrl(appliedTheme()),
        center: [66.9597, 39.654],
        zoom: 13,
        attributionControl: { compact: true },
      });
    } catch (error) {
      console.error('[field-watch] карта не поднялась:', error);
      return;
    }
    map.current = instance;
    instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    instance.on('error', (event: { error?: { message?: string } }) => {
      const message = String(event?.error?.message ?? '');
      if (message) setFailure(message);
    });

    // Рука человека важнее автоцентра. `dragstart` и `zoomstart` приходят и
    // от `easeTo`, поэтому слушаем только жест: у события есть исходное
    // DOM-событие, у программного движения его нет.
    const release = (event: { originalEvent?: unknown }) => {
      if (event.originalEvent) latest.current.onUserMoved();
    };
    instance.on('dragstart', release);
    instance.on('zoomstart', release);

    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(node);
    requestAnimationFrame(() => instance.resize());

    instance.on('load', () => {
      const { track: t, colors: c } = latest.current;
      instance.addSource(SOURCE_TRACK, {
        type: 'geojson',
        data: buildTrackCollection([t], []) as unknown as GeoJSON.FeatureCollection,
      });
      // Приведение — как в карте дня: спецификация слоя в типах maplibre
      // описана кортежами выражений, вывести которые из литерала нельзя.
      for (const layer of buildTrackLayers(c)) {
        instance.addLayer(layer as unknown as AddLayerObject);
      }
      ready.current = true;
      instance.resize();
    });

    return () => {
      ready.current = false;
      fitted.current = false;
      map.current = null;
      observer.disconnect();
      instance.remove();
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready.current) return;
    const source = instance.getSource(SOURCE_TRACK) as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(buildTrackCollection([track], []) as unknown as GeoJSON.FeatureCollection);

    // Масштаб подбираем ОДИН раз — по тому, что уже пройдено.
    if (!fitted.current) {
      const bounds = trackBounds([track]);
      if (bounds) {
        instance.fitBounds(bounds, FIT_TRACK);
        fitted.current = true;
      }
    } else if (following && center) {
      instance.easeTo({ center, duration: 600 });
    }
  }, [track, center, following]);

  return (
    <>
      {failure !== '' && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
          Карта: {failure}
        </div>
      )}
      <div
        ref={container}
        style={{
          width: '100%',
          height: 'min(60vh, 420px)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          marginBottom: 'var(--space-3)',
          background: 'var(--bg-secondary)',
        }}
      />
    </>
  );
}

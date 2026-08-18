'use client';

import { useEffect, useRef } from 'react';
// MapLibre 6 отказался от default-экспорта — только именованные.
import {
  GeoJSONSource,
  Map as MapLibreMap,
  NavigationControl,
  type AddLayerObject,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { DEFAULT_CENTER, DEFAULT_ZOOM, type ColorizeMode, type MapCollection } from './mapFeature';
import { attachMapEvents, type MapLatest } from './mapEvents';
import { LAYER_SELECTED, SOURCE_ID, buildLayers, clusterSourceOptions, styleUrl } from './mapLayers';
import { useTokenColors } from './useTokenColors';
import { useTheme } from '@/components/providers/ThemeProvider';

// ══════════════════════════════════════════════════════════════════════
// Холст карты: жизненный цикл MapLibre и ничего больше.
//
// Описания слоёв — в mapLayers.ts (чистые данные, проверяются тестом),
// подписки — в mapEvents.ts. Здесь остаётся создание карты, синхронизация
// с пропсами и уборка за собой.
//
// Загружается только через next/dynamic с ssr:false: maplibre-gl трогает
// window прямо на импорте, и при серверном рендере падает не страница, а
// вся сборка.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  data: MapCollection;
  mode: ColorizeMode;
  selectedId: number | null;
  /** Режим простановки пина: следующий клик по карте станет координатой. */
  placingId: number | null;
  onPickPoint: (id: number) => void;
  onPlace: (lngLat: { lng: number; lat: number }) => void;
  onViewportChange: (visibleIds: number[]) => void;
  onTilesError: () => void;
}

export default function CustomerMapCanvas(props: Props) {
  const { data, mode, selectedId, placingId } = props;
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const ready = useRef(false);
  const { theme } = useTheme();
  const colors = useTokenColors();

  const latest = useRef<MapLatest>({ ...props, colors, theme });
  // Обновляем после отрисовки, а не во время: запись в ref прямо в теле
  // рендера ломает конкурентный режим. Обработчики карты срабатывают на
  // действия человека, то есть заведомо позже эффекта.
  useEffect(() => {
    latest.current = { ...props, colors, theme };
  });

  // ── Создание карты: ровно один раз ────────────────────────────────
  useEffect(() => {
    const node = container.current;
    if (!node || map.current) return;

    /** Навесить источник и слои. И при старте, и после каждой смены стиля. */
    const attach = (instance: MapLibreMap) => {
      const now = latest.current;
      if (!instance.getSource(SOURCE_ID)) {
        instance.addSource(SOURCE_ID, {
          type: 'geojson',
          data: now.data as unknown as GeoJSON.FeatureCollection,
          ...clusterSourceOptions(),
        });
      }
      for (const layer of buildLayers(now.mode, now.colors, now.data.summary.spentPercentiles.p80)) {
        if (!instance.getLayer(layer.id)) instance.addLayer(layer as unknown as AddLayerObject);
      }
      ready.current = true;
    };

    const instance = new MapLibreMap({
      container: node,
      style: styleUrl(latest.current.theme),
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });
    map.current = instance;

    instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    instance.on('load', () => attach(instance));
    // После смены стиля MapLibre выбрасывает свои слои — навешиваем заново.
    instance.on('styledata', () => {
      if (instance.isStyleLoaded()) attach(instance);
    });

    const detach = attachMapEvents(instance, latest);

    return () => {
      detach();
      instance.remove();
      map.current = null;
      ready.current = false;
    };
  }, []);

  // ── Данные ────────────────────────────────────────────────────────
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready.current) return;
    const source = instance.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(data as unknown as GeoJSON.FeatureCollection);
  }, [data]);

  // ── Раскраска: меняем paint, данные не трогаем ─────────────────────
  const p80 = data.summary.spentPercentiles.p80;
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready.current) return;

    // Сигнатура MapLibre связывает имя свойства с его типом через огромное
    // перечисление. Повторять его у себя незачем: имена приходят из наших же
    // описаний слоёв, поэтому ослабляем ровно сигнатуру метода, а не значения.
    const setPaint = instance.setPaintProperty.bind(instance) as (
      layerId: string,
      name: string,
      value: unknown,
    ) => void;

    for (const layer of buildLayers(mode, colors, p80)) {
      if (!instance.getLayer(layer.id)) continue;
      for (const [prop, value] of Object.entries(layer.paint as Record<string, unknown>)) {
        setPaint(layer.id, prop, value);
      }
    }
  }, [mode, colors, p80]);

  // ── Тема: меняем подложку, слои вернёт обработчик styledata ────────
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    ready.current = false;
    instance.setStyle(styleUrl(theme));
  }, [theme]);

  // ── Выделение ─────────────────────────────────────────────────────
  useEffect(() => {
    const instance = map.current;
    if (!instance || !instance.getLayer(LAYER_SELECTED)) return;
    instance.setFilter(LAYER_SELECTED, ['==', ['id'], selectedId ?? -1]);
  }, [selectedId, data]);

  // ── Курсор в режиме простановки пина ──────────────────────────────
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    instance.getCanvas().style.cursor = placingId === null ? '' : 'crosshair';
  }, [placingId]);

  return (
    <div
      ref={container}
      // Высота задаётся здесь и обязательно явно: без неё MapLibre
      // схлопывается в ноль пикселей и выглядит как сломанная карта.
      // Tailwind в админке не действует (см. AdminCustomerTable), поэтому
      // инлайн на токенах.
      style={{
        width: '100%',
        height: '100%',
        minHeight: 320,
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        background: 'var(--bg-tertiary)',
      }}
    />
  );
}

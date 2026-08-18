import type {
  AddLayerObject,
  ErrorEvent,
  GeoJSONSource,
  Map as MapLibreMap,
  MapLayerMouseEvent,
  MapMouseEvent,
} from 'maplibre-gl';

import type { DeliveryCollection } from '@/lib/customers/deliveryRoutes';

import {
  LAYER_CLUSTERS,
  LAYER_POINTS,
  SOURCE_DELIVERY,
  SOURCE_ID,
  buildDeliveryLayers,
  buildLayers,
  clusterSourceOptions,
} from './mapLayers';
import type { ColorizeMode, MapCollection } from './mapFeature';
import type { TokenColors } from './useTokenColors';

// ══════════════════════════════════════════════════════════════════════
// Подписки карты, вынесенные из холста.
//
// Все обработчики читают текущее состояние из одного ref, а не из
// замыкания: подписки ставятся один раз при создании карты, и замыкание
// навсегда запомнило бы первый рендер — клик по точке звал бы обработчик
// недельной давности.
// ══════════════════════════════════════════════════════════════════════

export interface MapLatest {
  data: MapCollection;
  delivery: DeliveryCollection | null;
  mode: ColorizeMode;
  colors: TokenColors;
  theme: 'light' | 'dark';
  placingId: number | null;
  onPickPoint: (id: number) => void;
  onPlace: (lngLat: { lng: number; lat: number }) => void;
  onViewportChange: (visibleIds: number[]) => void;
  onTilesError: () => void;
}

const MOVE_DEBOUNCE_MS = 200;

/** Сообщения MapLibre, по которым видно, что подложка не приехала. */
function isTileFailure(message: string): boolean {
  return message.includes('style') || message.includes('tile') || message.includes('Failed');
}

/**
 * Навешивает все подписки. Возвращает функцию уборки: таймер дебаунса
 * переживёт удаление карты, если его не снять.
 */
export function attachMapEvents(
  instance: MapLibreMap,
  latest: { current: MapLatest },
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  // Отказ тайлов — не повод показывать пустой серый прямоугольник:
  // родитель переключится на список и скажет, что случилось.
  instance.on('error', (e: ErrorEvent) => {
    if (isTileFailure(String(e?.error?.message ?? ''))) latest.current.onTilesError();
  });

  instance.on('click', LAYER_POINTS, (e: MapLayerMouseEvent) => {
    const id = e.features?.[0]?.id;
    if (typeof id === 'number') latest.current.onPickPoint(id);
  });

  instance.on('click', LAYER_CLUSTERS, async (e: MapLayerMouseEvent) => {
    const feature = e.features?.[0];
    const clusterId = feature?.properties?.cluster_id;
    if (clusterId === undefined) return;
    const source = instance.getSource(SOURCE_ID) as GeoJSONSource;
    const zoom = await source.getClusterExpansionZoom(Number(clusterId));
    if (feature?.geometry?.type === 'Point') {
      instance.easeTo({ center: feature.geometry.coordinates as [number, number], zoom });
    }
  });

  // Клик по пустому месту в режиме простановки — новая координата.
  instance.on('click', (e: MapMouseEvent) => {
    if (latest.current.placingId === null) return;
    if (instance.queryRenderedFeatures(e.point, { layers: [LAYER_POINTS] }).length > 0) return;
    latest.current.onPlace(e.lngLat);
  });

  for (const layer of [LAYER_POINTS, LAYER_CLUSTERS]) {
    instance.on('mouseenter', layer, () => {
      instance.getCanvas().style.cursor = 'pointer';
    });
    instance.on('mouseleave', layer, () => {
      instance.getCanvas().style.cursor = latest.current.placingId === null ? '' : 'crosshair';
    });
  }

  instance.on('moveend', () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (!instance.getLayer(LAYER_POINTS)) return;
      const visible = instance
        .queryRenderedFeatures({ layers: [LAYER_POINTS] })
        .map((f) => f.id)
        .filter((id): id is number => typeof id === 'number');
      latest.current.onViewportChange(Array.from(new Set(visible)));
    }, MOVE_DEBOUNCE_MS);
  });

  return () => {
    if (timer) clearTimeout(timer);
  };
}


/** Пустая коллекция доставки: выключенный слой, а не удалённый источник. */
const EMPTY_DELIVERY = { type: 'FeatureCollection' as const, features: [] };

/**
 * Навешивает источники и слои. Зовётся и при старте карты, и после каждой
 * смены стиля: `setStyle` выбрасывает всё, что мы добавили поверх.
 *
 * Доставка идёт последней — она рисуется ПОВЕРХ клиентов. Маршрут смотрят,
 * когда точки уже расставлены, и линия под ними была бы бесполезна.
 */
export function attachMapLayers(instance: MapLibreMap, now: MapLatest): void {
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

  if (!instance.getSource(SOURCE_DELIVERY)) {
    instance.addSource(SOURCE_DELIVERY, {
      type: 'geojson',
      data: (now.delivery ?? EMPTY_DELIVERY) as unknown as GeoJSON.FeatureCollection,
    });
  }
  for (const layer of buildDeliveryLayers(now.colors)) {
    if (!instance.getLayer(layer.id)) instance.addLayer(layer as unknown as AddLayerObject);
  }
}

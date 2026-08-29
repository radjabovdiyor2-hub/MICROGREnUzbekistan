import type {
  AddLayerObject,
  ErrorEvent,
  Map as MapLibreMap,
  MapMouseEvent,
} from 'maplibre-gl';

import type { RoutePoint } from '@/lib/customers/dayRoute';
import type { DeliveryCollection } from '@/lib/customers/deliveryRoutes';

import {
  LAYER_POINTS,
  SOURCE_HEAT,
  SOURCE_ID,
  SOURCE_ROUTE,
  buildHeatLayer,
  buildLayers,
  buildRouteLayers,
  clusterSourceOptions,
  heatSourceOptions,
} from './mapLayers';
import { candidatesAt, handleClick, setHover } from './mapClick';
import { isCluster, pickHit } from './mapHit';
import { SOURCE_DELIVERY, buildDeliveryLayers } from './mapLayersDelivery';
import {
  EMPTY_DELIVERY,
  EMPTY_ROUTE,
  routeCollection,
  type ColorizeMode,
  type MapCollection,
} from './mapFeature';
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
  /** null — человек ткнул мимо всех точек и снял выбор. */
  onPickPoint: (id: number | null) => void;
  /**
   * Несколько точек в одном месте: выбирает человек, а не мы за него.
   * Необязателен — без него стопка разрешается ближайшей точкой, то есть
   * поведением не хуже прежнего, а не молчанием в ответ на нажатие.
   */
  onPickStack?: (ids: number[]) => void;
  /** Тепловая карта включена. */
  heat?: boolean;
  /** Остановки сегодняшнего объезда — их обводит свой слой. */
  routeStops?: RoutePoint[];
  /** Подробная подложка: названия улиц и здания вместо схемы. */
  detailedBase?: boolean;
  /** Полноэкранный режим: читает кнопка-контрол, живущая вне React. */
  isFull?: boolean;
  onToggleFull?: () => void;
  lang?: 'ru' | 'uz';
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

  instance.on('click', (e: MapMouseEvent) => {
    void handleClick(instance, latest, e);
  });

  // Курсор считается ТОЙ ЖЕ рамкой, что и клик. Послойные mouseenter
  // реагировали строго на отрисованный пиксель, и палец/мышь получали
  // «палец» указателя на полпикселя раньше, чем срабатывал клик, — то
  // есть указатель обещал не то, что случится по нажатию.
  instance.on('mousemove', (e: MapMouseEvent) => {
    if (latest.current.placingId !== null) return;
    const hit = pickHit(candidatesAt(instance, e), e.point);
    instance.getCanvas().style.cursor = hit ? 'pointer' : '';
    setHover(instance, hit && !isCluster(hit) ? hit.id : null);
  });

  instance.on('mouseout', () => {
    setHover(instance, null);
  });

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


/**
 * Навешивает источники и слои. Зовётся и при старте карты, и после каждой
 * смены стиля: `setStyle` выбрасывает всё, что мы добавили поверх.
 *
 * Доставка идёт последней — она рисуется ПОВЕРХ клиентов. Маршрут смотрят,
 * когда точки уже расставлены, и линия под ними была бы бесполезна.
 */
export function attachMapLayers(instance: MapLibreMap, now: MapLatest): void {
  const heat = now.data.summary.heat;
  const points = now.data as unknown as GeoJSON.FeatureCollection;

  // Тепло — ПЕРВЫМ и на своём источнике без кластеризации. Первым, потому
  // что заливка под точками, а не поверх: иначе она закрасила бы ровно то,
  // ради чего на карту смотрят.
  if (!instance.getSource(SOURCE_HEAT)) {
    instance.addSource(SOURCE_HEAT, {
      type: 'geojson',
      data: points,
      ...heatSourceOptions(),
    });
  }
  const heatLayer = buildHeatLayer(now.colors, heat);
  if (!instance.getLayer(heatLayer.id)) {
    instance.addLayer({
      ...heatLayer,
      layout: { visibility: now.heat ? 'visible' : 'none' },
    } as unknown as AddLayerObject);
  }

  if (!instance.getSource(SOURCE_ID)) {
    instance.addSource(SOURCE_ID, {
      type: 'geojson',
      data: points,
      ...clusterSourceOptions(),
    });
  }

  // Объезд дня — до слоёв клиентов: кольцо рисуется ВОКРУГ точки и должно
  // лежать под ней, иначе обводка съест саму точку.
  if (!instance.getSource(SOURCE_ROUTE)) {
    instance.addSource(SOURCE_ROUTE, {
      type: 'geojson',
      data: now.routeStops ? routeCollection(now.routeStops) : EMPTY_ROUTE,
    });
  }
  for (const layer of buildRouteLayers(now.colors)) {
    if (!instance.getLayer(layer.id)) instance.addLayer(layer as unknown as AddLayerObject);
  }

  for (const layer of buildLayers(
    now.mode,
    now.colors,
    now.data.summary.spentPercentiles.p80 ?? 0,
  )) {
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

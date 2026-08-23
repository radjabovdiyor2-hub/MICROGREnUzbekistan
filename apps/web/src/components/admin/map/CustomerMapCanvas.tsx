'use client';

import { useEffect, useRef } from 'react';
// MapLibre 6 отказался от default-экспорта — только именованные.
import {
  GeoJSONSource,
  GeolocateControl,
  Map as MapLibreMap,
  NavigationControl,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import type { RoutePoint } from '@/lib/customers/dayRoute';
import type { DeliveryCollection } from '@/lib/customers/deliveryRoutes';
// Импорт обязателен ДО создания карты: модуль сообщает MapLibre, где лежит
// воркер. Без него бандлер уводит воркер в 404, и карта показывает только
// фон стиля — чёрный прямоугольник вместо улиц.
import '@/lib/map/worker';

import {
  DEFAULT_BOUNDS,
  EMPTY_DELIVERY,
  EMPTY_ROUTE,
  routeCollection,
  FIT_MAX_ZOOM,
  FIT_PADDING,
  boundsOfFeatures,
  type ColorizeMode,
  type MapCollection,
} from './mapFeature';
import { attachMapEvents, attachMapLayers, type MapLatest } from './mapEvents';
import { FullscreenToggleControl } from './mapFullscreenControl';
import {
  LAYER_HEAT,
  LAYER_SELECTED,
  SOURCE_HEAT,
  SOURCE_ID,
  SOURCE_ROUTE,
  buildLayers,
  styleUrl,
} from './mapLayers';
import { SOURCE_DELIVERY } from './mapLayersDelivery';
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
  /** Слой доставки. null — выключен. */
  delivery: DeliveryCollection | null;
  mode: ColorizeMode;
  selectedId: number | null;
  /** Режим простановки пина: следующий клик по карте станет координатой. */
  placingId: number | null;
  /** null — человек ткнул мимо всех точек и снял выбор. */
  onPickPoint: (id: number | null) => void;
  /** Несколько точек в одном месте: выбирает человек, а не мы за него. */
  onPickStack?: (ids: number[]) => void;
  /** Тепловая карта поверх подложки и под точками. */
  heat?: boolean;
  /** Остановки сегодняшнего объезда — их обводит свой слой. */
  routeStops?: RoutePoint[];
  /** Подробная подложка: названия улиц и здания вместо схемы. */
  detailedBase?: boolean;
  /** Полноэкранный режим — им управляет родитель, кнопка живёт здесь. */
  isFull?: boolean;
  onToggleFull?: () => void;
  lang?: 'ru' | 'uz';
  onPlace: (lngLat: { lng: number; lat: number }) => void;
  onViewportChange: (visibleIds: number[]) => void;
  onTilesError: () => void;
  /** Меняется при смене фильтров — по нему подгоняется вид. */
  fitToken: string;
  /** Куда подлететь по выбору из поиска. null — не трогать вид. */
  focus: { lng: number; lat: number; at: number } | null;
}

export default function CustomerMapCanvas(props: Props) {
  const {
    data,
    delivery,
    mode,
    selectedId,
    placingId,
    fitToken,
    focus,
    heat,
    routeStops,
    detailedBase,
    isFull,
  } = props;
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const ready = useRef(false);
  const fullscreenControl = useRef<FullscreenToggleControl | null>(null);
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

    const attach = (m: MapLibreMap) => {
      attachMapLayers(m, latest.current);
      ready.current = true;
    };

    let instance: MapLibreMap;
    try {
      instance = new MapLibreMap({
        container: node,
        style: styleUrl(latest.current.theme, latest.current.detailedBase),
        // Рамкой, а не центром с зумом: пока точек нет, показываем оба
        // города сразу — ферма в Самарканде, заведения и там, и в Ташкенте.
        bounds: DEFAULT_BOUNDS,
        fitBoundsOptions: { padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM },
        attributionControl: { compact: true },
      });
    } catch (error) {
      // Конструктор бросает СИНХРОННО без WebGL, и подписка на 'error' до
      // этого места не доживает. Без перехвата исключение вылетает из
      // эффекта и уносит весь раздел «Клиенты»; вместо этого родитель
      // покажет список и скажет, что карта недоступна.
      console.error('[customer-map] карта не поднялась:', error);
      latest.current.onTilesError();
      return;
    }
    map.current = instance;

    instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    // «Где я» — для поля. Без него человек с картой в руках не понимает, к
    // какой из точек он ближе; браузер спросит разрешение сам, а отказ
    // просто оставит кнопку неактивной и ничего не сломает.
    instance.addControl(
      new GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserLocation: true,
      }),
      'top-right',
    );
    // Кнопка режима — в общей стопке справа сверху, третьей после зума и
    // «где я». Состояние и обработчик читаются из ref: контрол живёт вне
    // React и переживает все перерисовки холста.
    const fullscreen = new FullscreenToggleControl({
      onToggle: () => latest.current.onToggleFull?.(),
      isFull: () => latest.current.isFull === true,
      label: (full) =>
        latest.current.lang === 'uz'
          ? full
            ? 'Toʻliq ekrandan chiqish'
            : 'Toʻliq ekran'
          : full
            ? 'Выйти из полного экрана'
            : 'На весь экран',
    });
    instance.addControl(fullscreen, 'top-right');
    fullscreenControl.current = fullscreen;

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
      fullscreenControl.current = null;
    };
  }, []);

  // ── Вид по точкам ─────────────────────────────────────────────────
  //
  // Подгоняем не на каждое обновление данных, а когда меняется fitToken —
  // то есть фильтры или сам факт наличия точек. Иначе фоновый опрос раз в
  // минуту дёргал бы карту из-под руки владельца, стоило ему её сдвинуть.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    // Точки берём из ref, а не из пропа: попади `data` в зависимости —
    // вид подгонялся бы на каждый фоновый опрос, дёргая карту из-под руки.
    // Эффект синхронизации ref объявлен выше и на этом же рендере уже
    // отработал, так что здесь лежит свежая коллекция.
    const box = boundsOfFeatures(latest.current.data.features);
    instance.fitBounds(box ?? DEFAULT_BOUNDS, {
      padding: FIT_PADDING,
      maxZoom: FIT_MAX_ZOOM,
      // Без анимации: это установка вида, а не путешествие по карте.
      animate: false,
    });
  }, [fitToken]);

  // ── Подлёт к точке из поиска ──────────────────────────────────────
  //
  // Отдельно от fitBounds: тот показывает ВСЕ точки, а этот ведёт к одной.
  // Метка времени в зависимостях не украшение — выбрать ту же точку второй
  // раз обязано снова сработать, а по одним координатам эффект молчал бы.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !focus) return;
    instance.easeTo({ center: [focus.lng, focus.lat], zoom: 16, duration: 600 });
  }, [focus]);

  // ── Данные ────────────────────────────────────────────────────────
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready.current) return;
    const collection = data as unknown as GeoJSON.FeatureCollection;
    (instance.getSource(SOURCE_ID) as GeoJSONSource | undefined)?.setData(collection);
    // Тот же массив в оба источника: тепло не может показывать не то, что
    // показывают точки, иначе заливка и россыпь начнут спорить друг с другом.
    (instance.getSource(SOURCE_HEAT) as GeoJSONSource | undefined)?.setData(collection);
  }, [data]);

  // ── Тепловая карта: гасим слой, а не выбрасываем источник ──────────
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready.current || !instance.getLayer(LAYER_HEAT)) return;
    instance.setLayoutProperty(LAYER_HEAT, 'visibility', heat ? 'visible' : 'none');
  }, [heat]);

  // ── Объезд дня ────────────────────────────────────────────────────
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready.current) return;
    const source = instance.getSource(SOURCE_ROUTE) as GeoJSONSource | undefined;
    source?.setData(routeStops ? routeCollection(routeStops) : EMPTY_ROUTE);
  }, [routeStops]);

  // ── Слой доставки ─────────────────────────────────────────────────
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready.current) return;
    const source = instance.getSource(SOURCE_DELIVERY) as GeoJSONSource | undefined;
    // Выключенный слой — пустая коллекция, а не удаление источника:
    // пересоздавать слои на каждое переключение дороже и мигает.
    source?.setData((delivery ?? EMPTY_DELIVERY) as unknown as GeoJSON.FeatureCollection);
  }, [delivery]);

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

  // ── Подложка: тема и подробность ──────────────────────────────────
  //
  // Слои после смены стиля вернёт обработчик styledata: setStyle
  // выбрасывает всё, что мы добавили поверх.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    ready.current = false;
    instance.setStyle(styleUrl(theme, detailedBase));
  }, [theme, detailedBase]);

  // ── Выделение ─────────────────────────────────────────────────────
  useEffect(() => {
    const instance = map.current;
    if (!instance || !instance.getLayer(LAYER_SELECTED)) return;
    instance.setFilter(LAYER_SELECTED, ['==', ['id'], selectedId ?? -1]);
  }, [selectedId, data]);

  // ── Иконка кнопки полного экрана ──────────────────────────────────
  //
  // Контрол о смене состояния сам не узнает: он вне React.
  useEffect(() => {
    fullscreenControl.current?.sync();
  }, [isFull]);

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

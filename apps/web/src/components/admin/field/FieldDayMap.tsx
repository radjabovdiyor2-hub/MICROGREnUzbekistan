'use client';

import { useEffect, useRef, useState } from 'react';
// БЕЗ ЭТОГО ИМПОРТА КАРТА — ПУСТОЙ ПРЯМОУГОЛЬНИК.
//
// Стили maplibre подключались только в карте клиентов, а этот экран —
// отдельный чанк и её не грузит. Без `.maplibregl-canvas { position:
// absolute }` холст остаётся нулевого размера: контейнер виден, тайлов
// нет, ошибок тоже нет. Импорт идемпотентен — бандлер подключит стили
// один раз, сколько бы карт их ни просило.
import 'maplibre-gl/dist/maplibre-gl.css';
// И БЕЗ ЭТОГО — ТОЖЕ ПУСТОЙ ПРЯМОУГОЛЬНИК, но по другой причине.
//
// Векторные тайлы разбирает Web Worker, и его адрес задаётся один раз на
// приложение побочным эффектом этого модуля. Раньше его импортировали
// только карта клиентов и витринная — на вкладке «День в поле» ни одной
// из них нет, адрес оставался невыставленным, MapLibre вычислял его от
// `import.meta.url`, получал 404 и воркер умирал МОЛЧА: стиль, спрайты и
// TileJSON приходят главным потоком, а тайлов и шрифтов нет. Ни ошибки,
// ни исключения — ровный чёрный прямоугольник с кнопками зума.
import '@/lib/map/worker';
import { webglMissing } from '@/lib/map/webgl';
import {
  Map as MapLibreMap,
  NavigationControl,
  type AddLayerObject,
  type GeoJSONSource,
} from 'maplibre-gl';

import { appliedTheme, styleUrl } from '../map/mapLayers';
import {
  FIT_TRACK, SOURCE_TRACK, buildTrackCollection, buildTrackLayers, trackBounds,
  type TrackPoint, type TrackStayPoint,
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
  tracks,
  stays,
}: {
  /** По пути на человека. Один массив на всех склеил бы их в одну дорогу. */
  tracks: TrackPoint[][];
  stays: TrackStayPoint[];
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const resizeRef = useRef<ResizeObserver | null>(null);
  const ready = useRef(false);
  const colors = useTokenColors();
  // Отказ должен быть ВИДЕН: прямоугольник без объяснения выглядит как
  // «карта такая» и живёт месяцами. Про WebGL спрашиваем ДО создания карты
  // — конструктор без него бросает синхронно, и этот случай уходил в консоль.
  const [failure, setFailure] = useState(() =>
    webglMissing() ? 'не поднялась — похоже, в браузере выключен WebGL' : '',
  );

  // Свежие данные держим в ref: эффект инициализации должен выполниться
  // один раз, а данные к нему приезжают позже.
  const latest = useRef({ tracks, stays, colors });
  // Обновляем ПОСЛЕ отрисовки, а не во время: запись в ref прямо в теле
  // рендера ломает конкурентный режим. Так же сделано в CustomerMapCanvas.
  useEffect(() => {
    latest.current = { tracks, stays, colors };
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

    // Ошибку не глотаем: у карты клиентов такой обработчик есть, и без
    // него любая неудача тайлов выглядит просто чёрным полем.
    instance.on('error', (event: { error?: { message?: string } }) => {
      const message = String(event?.error?.message ?? '');
      if (message) setFailure(message);
      console.error('[field-day] карта:', message || event);
    });

    // Контейнер получает высоту вместе с раскладкой, и карта, созданная
    // раньше этого момента, запоминает НУЛЕВОЙ размер: контролы и подпись
    // рисуются (они обычные элементы), а холст остаётся пустым — ровно то,
    // что выглядит как чёрный прямоугольник с плюсом и минусом.
    //
    // Наблюдатель, а не единичный вызов: угадывать, когда встанут все
    // родители, бессмысленно — вкладка, аккордеон и полный экран меняют
    // размер в разные моменты.
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(node);
    resizeRef.current = observer;
    requestAnimationFrame(() => instance.resize());

    instance.on('load', () => {
      const { tracks: t, stays: s, colors: c } = latest.current;
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
      // Ещё один пересчёт размера — уже после загрузки стиля. Наблюдатель
      // выше срабатывает на изменение контейнера, а этот случай другой:
      // контейнер не менялся, но холст мог быть создан до того, как
      // раскладка встала.
      instance.resize();
      fitToTrack(instance, t);
    });

    return () => {
      ready.current = false;
      map.current = null;
      resizeRef.current?.disconnect();
      resizeRef.current = null;
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
    source.setData(buildTrackCollection(tracks, stays) as unknown as GeoJSON.FeatureCollection);
    fitToTrack(instance, tracks);
  }, [tracks, stays]);

  return (
    <>
      {failure !== '' && (
        <div
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-secondary)',
            marginBottom: 'var(--space-1)',
          }}
        >
          Карта: {failure}
        </div>
      )}
    <div
      ref={container}
      style={{
        // Ширина явно, как у карты клиентов: без неё MapLibre в некоторых
        // раскладках схлопывается и выглядит сломанным.
        width: '100%',
        height: 320,
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        marginBottom: 'var(--space-4)',
        background: 'var(--bg-secondary)',
      }}
    />
    </>
  );
}

/** Показать пути целиком. Точек нет — рамку не трогаем. */
function fitToTrack(instance: MapLibreMap, tracks: TrackPoint[][]) {
  const bounds = trackBounds(tracks);
  if (bounds) instance.fitBounds(bounds, FIT_TRACK);
}

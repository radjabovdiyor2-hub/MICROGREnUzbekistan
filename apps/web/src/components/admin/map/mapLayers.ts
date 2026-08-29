import { MAP_FONT } from './mapFont';
import {
  bucketColor,
  clusterColor,
  clusterRadius,
  heatColor,
  heatWeight,
  pointColor,
  pointRadius,
  pointStrokeColor,
  pointStrokeWidth,
  ringRadius,
  type Expression,
} from './mapPaint';
import type { ColorizeMode } from './mapFeature';
import type { TokenColors } from './useTokenColors';

// ══════════════════════════════════════════════════════════════════════
// Описания слоёв карты — чистые данные, без обращения к MapLibre.
//
// Что рисуем и в каком порядке. Чем красим — в mapPaint.ts.
// ══════════════════════════════════════════════════════════════════════

// Раскраска экспортируется отсюда же: для остального кода граница между
// «что» и «чем» значения не имеет, а два импорта вместо одного — лишний
// повод ошибиться.
export {
  bucketColor,
  clusterColor,
  clusterRadius,
  pointColor,
  pointRadius,
  pointStrokeColor,
  pointStrokeWidth,
  ringRadius,
  type Expression,
};

export const SOURCE_ID = 'customers';
export const LAYER_CLUSTERS = 'customers-clusters';
export const LAYER_CLUSTER_COUNT = 'customers-cluster-count';
export const LAYER_POINTS = 'customers-points';
export const LAYER_PROSPECTS = 'customers-prospects';
export const LAYER_SELECTED = 'customers-selected';
export const LAYER_ATTENTION = 'customers-attention';
export const LAYER_VISITED = 'customers-visited';
export const LAYER_LABELS = 'customers-labels';
export const LAYER_HOVER = 'customers-hover';

/** Тепло живёт на СВОЁМ источнике — без кластеризации. */
export const SOURCE_HEAT = 'customers-heat-src';
export const LAYER_HEAT = 'customers-heat';

/** Объезд дня: свой крошечный источник по ≤10 остановкам из localStorage. */
export const SOURCE_ROUTE = 'day-route';
export const LAYER_ROUTE_MARK = 'day-route-mark';

/** Только настоящие клиенты: цели рисует свой слой. */
const IS_CUSTOMER: Expression = [
  'all',
  ['!', ['has', 'point_count']],
  ['!=', ['get', 'k'], 'restaurant'],
];

/**
 * Настройки источника с кластеризацией.
 *
 * `clusterProperties` — то, ради чего кластеризация вообще берётся родная:
 * без них кластер знает только `point_count` и красится «просто много
 * точек». С ними он несёт в себе долю проблемных клиентов и сумму денег,
 * и группа краснеет ровно тогда, когда внутри неё что-то происходит.
 */
export function clusterSourceOptions() {
  return {
    cluster: true,
    clusterRadius: 50,
    clusterMaxZoom: 13,
    clusterProperties: {
      sumSpent: ['+', ['get', 'sp']],
      atRisk: [
        '+',
        ['case', ['in', ['get', 'st'], ['literal', ['at_risk', 'lost']]], 1, 0],
      ],
    },
  };
}

/**
 * Тепловой слой на отдельном НЕкластеризованном источнике.
 *
 * Кластеризованный источник на низком зуме отдаёт вместо точек кластеры,
 * а тепло по кластерам — это тепло по их центрам тяжести, то есть враньё
 * ровно на том масштабе, ради которого слой и включают. Данные те же
 * самые, лишний в памяти только индекс.
 */
export function heatSourceOptions() {
  return { cluster: false };
}

export function buildHeatLayer(c: TokenColors, heat: { field: 'sp' | 'oc'; p80: number }) {
  return {
    id: LAYER_HEAT,
    type: 'heatmap' as const,
    source: SOURCE_HEAT,
    // Цели из справочника — это ещё не продажи. Смешать их с клиентами
    // значило бы показать «густо» там, где мы ничего не зарабатываем.
    filter: ['!=', ['get', 'k'], 'restaurant'],
    paint: {
      'heatmap-weight': heatWeight(heat.field, heat.p80),
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, 1, 14, 3],
      'heatmap-color': heatColor(c),
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 12, 14, 30],
      // К зуму улицы тепло уходит: там уже видны сами точки, и заливка
      // поверх них только мешает целиться.
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.8, 16, 0],
    },
  };
}

/**
 * Отметка «эта точка в сегодняшнем объезде».
 *
 * Отдельный источник, а не `feature-state` на клиентах: источник клиентов
 * кластеризованный, `setFeatureState` в проекте ни разу не вызывался, и
 * заводить непроверенный механизм ради десяти точек незачем. Объезд и так
 * живёт отдельно — в localStorage, а не в базе.
 */
export function buildRouteLayers(c: TokenColors) {
  return [
    {
      id: LAYER_ROUTE_MARK,
      type: 'circle' as const,
      source: SOURCE_ROUTE,
      paint: {
        'circle-color': 'transparent',
        'circle-radius': 15,
        'circle-stroke-color': c.brand,
        'circle-stroke-width': 2,
        'circle-stroke-opacity': 0.9,
      },
    },
  ];
}

/** Полный набор слоёв источника клиентов. Порядок важен: выделение поверх всего. */
export function buildLayers(mode: ColorizeMode, c: TokenColors, p80: number) {
  return [
    {
      // Проспекты — заведения, которые нам ещё не клиенты. Пустая заливка с
      // тонкой обводкой: «белое пятно» и должно читаться как дырка в
      // покрытии, а не как ещё одна точка продаж.
      id: LAYER_PROSPECTS,
      type: 'circle' as const,
      source: SOURCE_ID,
      filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'k'], 'restaurant']],
      paint: {
        'circle-color': 'transparent',
        'circle-radius': 7,
        'circle-stroke-color': c.muted,
        'circle-stroke-width': 1.5,
        'circle-stroke-opacity': 0.9,
      },
    },
    {
      // Второй канал помимо цвета. Отличить красный кружок от жёлтого на
      // солнце с телефона в руке трудно, а при дальтонизме невозможно —
      // ореол же читается формой и работает в любом режиме раскраски,
      // даже когда цвет занят выручкой или типом заведения.
      id: LAYER_ATTENTION,
      type: 'circle' as const,
      source: SOURCE_ID,
      filter: [
        'all',
        IS_CUSTOMER,
        ['in', ['get', 'st'], ['literal', ['at_risk', 'lost']]],
      ],
      paint: {
        'circle-color': c.error,
        'circle-radius': ringRadius(7),
        'circle-opacity': 0.18,
      },
    },
    {
      // «Тут были на этой неделе». Цвет НЕ трогаем: состояние считается по
      // заказам, и перекрашивать точку за факт визита значило бы показать
      // здоровье там, где была только поездка.
      id: LAYER_VISITED,
      type: 'circle' as const,
      source: SOURCE_ID,
      filter: ['all', IS_CUSTOMER, ['<=', ['coalesce', ['get', 'lv'], 9999], 7]],
      paint: {
        'circle-color': 'transparent',
        'circle-radius': ringRadius(4),
        'circle-stroke-color': c.success,
        'circle-stroke-width': 1.5,
        'circle-stroke-opacity': 0.7,
      },
    },
    {
      id: LAYER_CLUSTERS,
      type: 'circle' as const,
      source: SOURCE_ID,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': clusterColor(c),
        'circle-radius': clusterRadius(),
        'circle-opacity': 0.85,
        'circle-stroke-width': 2,
        'circle-stroke-color': c.card,
      },
    },
    {
      id: LAYER_CLUSTER_COUNT,
      type: 'symbol' as const,
      source: SOURCE_ID,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        // Стек назван явно: умолчательный уходит в 404 на нашем хосте
        // и откатывается на системный шрифт клиента — см. mapFont.ts.
        'text-font': MAP_FONT,
        'text-size': 12,
      },
      paint: { 'text-color': c.card },
    },
    {
      id: LAYER_POINTS,
      type: 'circle' as const,
      source: SOURCE_ID,
      // Проспекты исключены: их рисует свой слой. Без этого заведение-цель
      // получило бы ещё и залитый серый кружок клиента.
      filter: IS_CUSTOMER,
      paint: {
        'circle-color': pointColor(mode, c, p80),
        'circle-radius': pointRadius(),
        'circle-stroke-color': pointStrokeColor(c),
        'circle-stroke-width': pointStrokeWidth(),
      },
    },
    {
      // Имя рядом с точкой. До этого узнать, кто перед тобой, можно было
      // только нажатием — на объезде это и была главная потеря времени.
      //
      // Порог 14 — масштаб района: выше подписи слились бы в кашу, ниже
      // их и негде разместить. При тесноте MapLibre отбрасывает лишние
      // сама (`text-optional` + запрет перекрытия), а `symbol-sort-key`
      // следит, чтобы отброшены были не те, кто платит больше.
      id: LAYER_LABELS,
      type: 'symbol' as const,
      source: SOURCE_ID,
      minzoom: 14,
      filter: ['!', ['has', 'point_count']],
      layout: {
        'text-field': ['get', 'n'],
        'text-font': MAP_FONT,
        'text-size': 11,
        // Подпись сама ищет свободную сторону от точки, а не лезет всегда
        // вниз: у карты клиентов точки стоят вдоль улиц, то есть плотно
        // по одной оси.
        'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
        // В em при размере 11px: должно перекрывать радиус самой крупной
        // точки (11) вместе с её обводкой (3), иначе подпись ляжет на пин.
        'text-radial-offset': 1.4,
        'text-justify': 'auto',
        'text-max-width': 8,
        'text-optional': true,
        'text-allow-overlap': false,
        'symbol-sort-key': ['match', ['get', 'vt'], 'top', 0, 'mid', 1, 2],
      },
      paint: {
        'text-color': c.text,
        // Ореол — не украшение: без него имя нечитаемо над улицей подложки.
        'text-halo-color': c.card,
        'text-halo-width': 1.5,
      },
    },
    {
      // Точка под курсором. Живёт фильтром, как и выделение: перерисовать
      // фильтр дешевле, чем гонять состояние через React на каждое
      // движение мыши.
      id: LAYER_HOVER,
      type: 'circle' as const,
      source: SOURCE_ID,
      filter: ['==', ['id'], -1],
      paint: {
        'circle-color': 'transparent',
        'circle-radius': ringRadius(5),
        'circle-stroke-color': c.text,
        'circle-stroke-width': 1.5,
        'circle-stroke-opacity': 0.4,
      },
    },
    {
      id: LAYER_SELECTED,
      type: 'circle' as const,
      source: SOURCE_ID,
      // Пустой фильтр до выбора: слой существует, но ничего не рисует.
      filter: ['==', ['id'], -1],
      paint: {
        'circle-color': 'transparent',
        // Радиус следует за размером точки: фиксированные 18px висели у
        // мелкого клиента в стороне от неё.
        'circle-radius': ringRadius(8),
        'circle-stroke-color': c.accent,
        'circle-stroke-width': 3,
      },
    },
  ];
}

/**
 * Подробная подложка есть только у светлой темы.
 *
 * Считано по самим стилям на хосте (слои с подписями дорог / POI):
 *
 *   positron  6 / 1     liberty  8 / 5     bright  8 / 5
 *   dark      4 / 0     fiord    2 / 0
 *
 * То есть у тёмных стилей подписей не больше, а МЕНЬШЕ: `fiord` — не
 * подробный вариант `dark`, а ещё более молчаливый. Поэтому в тёмной теме
 * переключатель не предлагается вовсе; обещать подробность и подсунуть
 * ту же карту хуже, чем не обещать.
 */
export const DETAILED_BASE_THEMES = ['light'] as const;

export function hasDetailedBase(theme: 'light' | 'dark'): boolean {
  return (DETAILED_BASE_THEMES as readonly string[]).includes(theme);
}

/**
 * Адрес стиля тайлов. Тёмная тема получает тёмную подложку.
 *
 * `detailed` — подложка с названиями улиц и зданиями: в незнакомом районе
 * это разница между «где-то тут» и «вот этот дом». Хост тот же самый,
 * поэтому правки CSP не требуется.
 */
export function styleUrl(theme: 'light' | 'dark', detailed: boolean = false): string {
  const base = process.env.NEXT_PUBLIC_MAP_TILES_URL || 'https://tiles.openfreemap.org';
  const style = theme === 'dark' ? 'dark' : detailed ? 'liberty' : 'positron';
  return `${base.replace(/\/$/, '')}/styles/${style}`;
}

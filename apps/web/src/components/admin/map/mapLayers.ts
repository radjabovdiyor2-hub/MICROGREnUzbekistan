import type { ColorizeMode } from './mapFeature';
import type { TokenColors } from './useTokenColors';

// ══════════════════════════════════════════════════════════════════════
// Описания слоёв карты — чистые данные, без обращения к MapLibre.
//
// Вынесены из canvas по двум причинам. Первая: инициализация карты вместе
// с десятком paint-выражений не помещается в 200 строк. Вторая, важнее:
// выражения — обычные массивы, и их можно проверить тестом. Проверяется
// то, что глазами не видно, — что цвет пришёл параметром, а не вписан
// хексом мимо дизайн-системы.
// ══════════════════════════════════════════════════════════════════════

/** MapLibre-выражение: массив произвольной вложенности. */
export type Expression = unknown[];

export const SOURCE_ID = 'customers';
export const LAYER_CLUSTERS = 'customers-clusters';
export const LAYER_CLUSTER_COUNT = 'customers-cluster-count';
export const LAYER_POINTS = 'customers-points';
export const LAYER_PROSPECTS = 'customers-prospects';
export const LAYER_SELECTED = 'customers-selected';

export const SOURCE_DELIVERY = 'delivery';
export const LAYER_DELIVERY_LEGS = 'delivery-legs';
export const LAYER_DELIVERY_STOPS = 'delivery-stops';
export const LAYER_DELIVERY_SEQ = 'delivery-seq';

/**
 * Слой доставки поверх клиентов: линия объезда и пронумерованные точки.
 *
 * Номер на точке — не украшение. Порядок объезда назначает диспетчер, и
 * без цифры линия читается как «маршрут откуда-то куда-то»: непонятно, с
 * какого конца курьер начинает. Доставленные точки гасятся до успеха,
 * чтобы на карте было видно, где он сейчас.
 */
export function buildDeliveryLayers(c: TokenColors) {
  const delivered = ['==', ['get', 'status'], 'delivered'];
  return [
    {
      id: LAYER_DELIVERY_LEGS,
      type: 'line' as const,
      source: SOURCE_DELIVERY,
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
      paint: {
        'line-color': c.brand,
        'line-width': 3,
        'line-opacity': 0.6,
        'line-dasharray': [2, 1],
      },
    },
    {
      id: LAYER_DELIVERY_STOPS,
      type: 'circle' as const,
      source: SOURCE_DELIVERY,
      filter: ['==', ['get', 'kind'], 'stop'],
      paint: {
        'circle-color': ['case', delivered, c.success, c.brand],
        'circle-radius': 12,
        'circle-stroke-color': c.card,
        'circle-stroke-width': 2,
      },
    },
    {
      id: LAYER_DELIVERY_SEQ,
      type: 'symbol' as const,
      source: SOURCE_DELIVERY,
      filter: ['==', ['get', 'kind'], 'stop'],
      layout: {
        'text-field': ['to-string', ['get', 'seq']],
        'text-size': 12,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': c.card },
    },
  ];
}

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

/** Цвет точки по состоянию отношений — режим по умолчанию. */
function stateColor(c: TokenColors): Expression {
  return [
    'match',
    ['get', 'st'],
    'healthy', c.success,
    'new', c.info,
    'slipping', c.slipping,
    'at_risk', c.warning,
    'lost', c.error,
    c.muted, // prospect и всё неизвестное
  ];
}

/** Непрерывная шкала: чем больше денег, тем насыщеннее точка. */
function revenueColor(c: TokenColors, p80: number): Expression {
  const top = Math.max(p80, 1);
  return [
    'interpolate',
    ['linear'],
    ['get', 'sp'],
    0, c.rampLow,
    top / 2, c.rampMid,
    top, c.rampHigh,
  ];
}

/** Частота: чем чаще заказывает, тем насыщеннее. Считаем по просрочке. */
function frequencyColor(c: TokenColors): Expression {
  return [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', 'ov'], 5],
    0, c.rampHigh,
    1, c.rampMid,
    4, c.rampLow,
  ];
}

function typeColor(c: TokenColors): Expression {
  return ['match', ['get', 't'], 'b2b', c.brand, 'b2c', c.info, c.muted];
}

export function pointColor(mode: ColorizeMode, c: TokenColors, p80: number): Expression {
  if (mode === 'revenue') return revenueColor(c, p80);
  if (mode === 'frequency') return frequencyColor(c);
  if (mode === 'type') return typeColor(c);
  return stateColor(c);
}

/**
 * Размер точки — деньги, всегда. Цвет отвечает за состояние, размер за
 * ценность: два независимых канала на одной карте вместо одного
 * перегруженного. Смешать их значит потерять оба сигнала.
 */
export function pointRadius(): Expression {
  return ['match', ['get', 'vt'], 'top', 11, 'mid', 8, 6];
}

/**
 * Обводка. Точка, поставленная человеком, обведена акцентом: видно, что
 * координата проверена, а не угадана геокодером.
 */
export function pointStrokeColor(c: TokenColors): Expression {
  return ['case', ['==', ['get', 'gs'], 'manual'], c.accent, c.card];
}

export function pointStrokeWidth(): Expression {
  return ['case', ['==', ['get', 'gs'], 'manual'], 3, 1.5];
}

/** Кластер краснеет по доле проблемных клиентов внутри, а не по размеру. */
export function clusterColor(c: TokenColors): Expression {
  return [
    'interpolate',
    ['linear'],
    ['/', ['get', 'atRisk'], ['max', ['get', 'point_count'], 1]],
    0, c.success,
    0.5, c.warning,
    1, c.error,
  ];
}

export function clusterRadius(): Expression {
  return ['interpolate', ['linear'], ['get', 'point_count'], 2, 16, 50, 28, 500, 40];
}

/** Полный набор слоёв. Порядок важен: выделение поверх всего. */
export function buildLayers(mode: ColorizeMode, c: TokenColors, p80: number) {
  return [
    {
      // Проспекты — заведения, которые нам ещё не клиенты. Пустая заливка с
      // пунктирной обводкой: «белое пятно» и должно читаться как дырка в
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
        'text-size': 12,
      },
      paint: { 'text-color': c.card },
    },
    {
      id: LAYER_POINTS,
      type: 'circle' as const,
      source: SOURCE_ID,
      // Проспекты исключены: их рисует свой слой пунктиром. Без этого
      // заведение-цель получило бы ещё и залитый серый кружок клиента.
      filter: ['all', ['!', ['has', 'point_count']], ['!=', ['get', 'k'], 'restaurant']],
      paint: {
        'circle-color': pointColor(mode, c, p80),
        'circle-radius': pointRadius(),
        'circle-stroke-color': pointStrokeColor(c),
        'circle-stroke-width': pointStrokeWidth(),
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
        'circle-radius': 18,
        'circle-stroke-color': c.text,
        'circle-stroke-width': 2,
      },
    },
  ];
}

/** Адрес стиля тайлов. Тёмная тема получает тёмную подложку. */
export function styleUrl(theme: 'light' | 'dark'): string {
  const base = process.env.NEXT_PUBLIC_MAP_TILES_URL || 'https://tiles.openfreemap.org';
  return `${base.replace(/\/$/, '')}/styles/${theme === 'dark' ? 'dark' : 'positron'}`;
}

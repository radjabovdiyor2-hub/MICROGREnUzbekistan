import { BUCKET_META, bucketPairs, type ColorBucket } from '@/lib/customers/companyTypes';

import type { ColorizeMode } from './mapFeature';
import type { TokenColors } from './useTokenColors';

// ══════════════════════════════════════════════════════════════════════
// Выражения раскраски — чистые данные, без обращения к MapLibre.
//
// Выделены из mapLayers.ts, когда тот перерос читаемый размер. Граница:
// здесь ЧЕМ красить, там ЧТО рисовать. Обе половины — обычные массивы,
// и потому проверяются тестом; проверяется то, что глазами не видно, —
// что цвет пришёл параметром, а не вписан хексом мимо дизайн-системы.
// ══════════════════════════════════════════════════════════════════════

/** MapLibre-выражение: массив произвольной вложенности. */
export type Expression = unknown[];

/**
 * Радиус точки по её денежному разряду.
 *
 * Цвет отвечает за состояние, размер — за ценность: два независимых
 * канала на одной карте вместо одного перегруженного. Смешать их значит
 * потерять оба сигнала.
 */
const TIER_RADIUS = { top: 11, mid: 8, low: 6 } as const;

/**
 * Радиус кольца вокруг точки: тот же разряд плюс запас.
 *
 * Единая функция на все обводки не ради краткости. Кольцо «в объезде» и
 * кольцо «были недавно» рисуются вокруг точки, и если их радиус задать
 * числом, у крупного клиента (11px) кольцо ляжет ему внутрь, а у мелкого
 * (6px) повиснет в стороне. Обводка обязана следовать за размером точки.
 */
export function ringRadius(extra: number): Expression {
  return [
    'match',
    ['get', 'vt'],
    'top', TIER_RADIUS.top + extra,
    'mid', TIER_RADIUS.mid + extra,
    TIER_RADIUS.low + extra,
  ];
}

export function pointRadius(): Expression {
  return ringRadius(0);
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

/**
 * Цвет по типу заведения — через цветовые корзины, а не по категории.
 *
 * Категорий пятнадцать, различимых цветов восемь. Раскраска один-в-один
 * дала бы карту, на которой «кофейня» и «пекарня» отличаются оттенком,
 * который никто не различит, — то есть цвет перестал бы что-либо значить.
 * Разбиение на корзины живёт в companyTypes.ts вместе с легендой, чтобы
 * подпись и цвет не могли разойтись.
 */
function categoryColor(c: TokenColors): Expression {
  const pairs: (string | Expression)[] = [];
  for (const [slug, bucket] of bucketPairs()) {
    pairs.push(slug, bucketColor(c, bucket));
  }
  // Последним — цвет для точек без типа: справочник знает не всё, и
  // карточка, заведённая менеджером руками, приходит без категории.
  return ['match', ['get', 'ct'], ...pairs, c.muted] as Expression;
}

/** Цвет корзины по её токену. Токен назван в BUCKET_META — источник один. */
export function bucketColor(c: TokenColors, bucket: ColorBucket): string {
  const token = BUCKET_META[bucket].token as keyof TokenColors;
  return c[token] ?? c.muted;
}

export function pointColor(mode: ColorizeMode, c: TokenColors, p80: number): Expression {
  if (mode === 'revenue') return revenueColor(c, p80);
  if (mode === 'frequency') return frequencyColor(c);
  if (mode === 'type') return typeColor(c);
  if (mode === 'category') return categoryColor(c);
  return stateColor(c);
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

/**
 * Вес точки в тепловой карте.
 *
 * Считаем по деньгам, нормируя на p80. У продавца суммы замаскированы в
 * null (см. money.ts), и `coalesce` роняет всех в нижнюю ступень — слой
 * сам вырождается в «где густо». Это не потеря, а ровно тот вопрос,
 * который продавцу и нужен; выдумывать ему вторую шкалу незачем.
 *
 * Нижняя ступень НЕ ноль: клиент без выручки — всё равно клиент, и
 * нулевой вес выкинул бы его из карты плотности совсем.
 */
export function heatWeight(p80: number): Expression {
  return [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', 'sp'], 0],
    0, 0.3,
    Math.max(p80, 1), 1,
  ];
}

/** Цветовая рампа тепла. Нулевая плотность обязана быть прозрачной. */
export function heatColor(c: TokenColors): Expression {
  return [
    'interpolate',
    ['linear'],
    ['heatmap-density'],
    0, 'transparent',
    0.2, c.rampLow,
    0.6, c.rampMid,
    1, c.rampHigh,
  ];
}

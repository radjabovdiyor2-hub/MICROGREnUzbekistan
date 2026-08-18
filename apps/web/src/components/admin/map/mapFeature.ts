import type { MapCollection, MapFeature, MapPointProps, UnplacedCustomer } from '@/lib/customers/mapQuery';

// ══════════════════════════════════════════════════════════════════════
// Расшифровка коротких ключей точки — одна на весь проект.
//
// Свойства повторяются на каждой из тысяч точек, поэтому в JSON они
// сокращены до двух букв. Читать `p.st` вместо `p.state` в разметке было
// бы издевательством, поэтому граница проходит здесь: сервер отдаёт
// короткое, интерфейс дальше работает с длинным.
// ══════════════════════════════════════════════════════════════════════

export type { MapCollection, MapFeature, MapPointProps, UnplacedCustomer };

/** Режимы раскраски. Смена перекрашивает слой, но не перезапрашивает данные. */
export const COLORIZE_MODES = ['state', 'revenue', 'frequency', 'type'] as const;
export type ColorizeMode = (typeof COLORIZE_MODES)[number];

export const COLORIZE_LABELS: Record<ColorizeMode, { ru: string; uz: string }> = {
  state: { ru: 'По состоянию', uz: 'Holati boʻyicha' },
  revenue: { ru: 'По выручке', uz: 'Tushum boʻyicha' },
  frequency: { ru: 'По частоте', uz: 'Chastota boʻyicha' },
  type: { ru: 'По типу', uz: 'Turi boʻyicha' },
};

/** Свойства точки под длинными именами — для попапа и списка. */
export interface PointView {
  id: number;
  name: string;
  customerType: string;
  state: MapPointProps['st'];
  totalSpent: number;
  ordersCount: number;
  daysSinceLastOrder: number | null;
  overdueRatio: number | null;
  valueTier: MapPointProps['vt'];
  district: string | null;
  geoSource: string | null;
  longitude: number;
  latitude: number;
}

export function toPointView(feature: MapFeature): PointView {
  const p = feature.properties;
  return {
    id: feature.id,
    name: p.n,
    customerType: p.t,
    state: p.st,
    totalSpent: p.sp,
    ordersCount: p.oc,
    daysSinceLastOrder: p.dl,
    overdueRatio: p.ov,
    valueTier: p.vt,
    district: p.d,
    geoSource: p.gs,
    longitude: feature.geometry.coordinates[0],
    latitude: feature.geometry.coordinates[1],
  };
}

/** Пустая коллекция: карта рисуется до первого ответа, а не после. */
export const EMPTY_COLLECTION: MapCollection = {
  type: 'FeatureCollection',
  features: [],
  summary: {
    total: 0,
    placed: 0,
    unplaced: 0,
    byState: { prospect: 0, new: 0, healthy: 0, slipping: 0, at_risk: 0, lost: 0 },
    revenueByState: { prospect: 0, new: 0, healthy: 0, slipping: 0, at_risk: 0, lost: 0 },
    spentPercentiles: { p50: 0, p80: 0 },
  },
  unplaced: [],
};

/** Ташкент по умолчанию: там больше всего целевых заведений. */
export const DEFAULT_CENTER: [number, number] = [69.2401, 41.3111];
export const DEFAULT_ZOOM = 11;

export function formatSum(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(value));
}

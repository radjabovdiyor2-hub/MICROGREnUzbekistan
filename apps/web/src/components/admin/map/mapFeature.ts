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
export const COLORIZE_MODES = ['state', 'revenue', 'frequency', 'type', 'category'] as const;
export type ColorizeMode = (typeof COLORIZE_MODES)[number];

export const COLORIZE_LABELS: Record<ColorizeMode, { ru: string; uz: string }> = {
  state: { ru: 'По состоянию', uz: 'Holati boʻyicha' },
  revenue: { ru: 'По выручке', uz: 'Tushum boʻyicha' },
  frequency: { ru: 'По частоте', uz: 'Chastota boʻyicha' },
  type: { ru: 'По типу клиента', uz: 'Mijoz turi boʻyicha' },
  category: { ru: 'По типу заведения', uz: 'Muassasa turi boʻyicha' },
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
  companyType: string | null;
  audience: string | null;
  geoSource: string | null;
  phone: string | null;
  address: string | null;
  geoPrecision: string | null;
  lastVisitDays: number | null;
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
    companyType: p.ct,
    audience: p.au,
    geoSource: p.gs,
    phone: p.ph,
    address: p.ad,
    geoPrecision: p.gp,
    lastVisitDays: p.lv,
    longitude: feature.geometry.coordinates[0],
    latitude: feature.geometry.coordinates[1],
  };
}

/** Сколько совпадений показываем: список под поиском, а не выгрузка. */
export const SEARCH_LIMIT = 8;

/** Короче двух букв не ищем: одна буква совпадает почти со всем. */
export const SEARCH_MIN = 2;

/**
 * Поиск точки по названию среди уже загруженных.
 *
 * На клиенте, а не запросом: коллекция целиком уже здесь, и гонять сервер
 * ради подстроки незачем. Регистр снимается с обеих сторон — заведения
 * записаны и латиницей, и кириллицей, и вперемешку («Sam Ped Kolledj»
 * рядом с «Плов Центр»).
 *
 * Цели (`k === 'restaurant'`) ищутся наравне с клиентами: белое пятно на
 * карте — такой же адрес, куда надо съездить.
 */
export function searchPoints(features: MapFeature[], query: string): PointView[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < SEARCH_MIN) return [];

  const found: PointView[] = [];
  for (const f of features) {
    if (!f.properties.n.toLowerCase().includes(needle)) continue;
    found.push(toPointView(f));
    if (found.length >= SEARCH_LIMIT) break;
  }
  return found;
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
    districts: [],
  },
  unplaced: [],
};

/** Выключенный слой доставки: пустая коллекция вместо удаления источника. */
export const EMPTY_DELIVERY = {
  type: 'FeatureCollection' as const,
  features: [],
  routes: [],
};

/**
 * Стартовый вид, когда точек ещё нет: оба города разом.
 *
 * Фермa в Самарканде, а целевые заведения — и там, и в Ташкенте, поэтому
 * центрировать карту на одном городе значит спрятать половину дела. Рамка
 * растянута по двум точкам: Самарканд на юго-западе, Ташкент на
 * северо-востоке.
 */
export const SAMARKAND: [number, number] = [66.9597, 39.6542];
export const TASHKENT: [number, number] = [69.2401, 41.3111];
export const DEFAULT_BOUNDS: [[number, number], [number, number]] = [SAMARKAND, TASHKENT];

/** Ближе не приближаемся даже к одинокой точке — иначе теряется контекст. */
export const FIT_MAX_ZOOM = 14;
export const FIT_PADDING = 64;

/**
 * Рамка по точкам. null — точек нет, показываем оба города.
 *
 * Одна точка даёт вырожденную рамку нулевой площади: MapLibre такую
 * принимает, но уводит зум в максимум, поэтому его и ограничиваем.
 */
export function boundsOfFeatures(
  features: MapFeature[],
): [[number, number], [number, number]] | null {
  if (features.length === 0) return null;

  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const f of features) {
    const [lon, lat] = f.geometry.coordinates;
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }
  return [[minLon, minLat], [maxLon, maxLat]];
}

export function formatSum(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(value));
}

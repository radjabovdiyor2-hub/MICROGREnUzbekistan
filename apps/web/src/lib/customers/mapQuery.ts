import { prisma, Prisma } from '@repo/database';

import { citySpellings, normalizeCity } from './addressKey';
import { isAudience, isCompanyType } from './companyTypes';
import { districtsOfCity, isDistrict } from './districts';
import {
  SEGMENT_STATES,
  computeSegment,
  spentPercentiles,
  valueTier,
  type SegmentState,
  type ValueTier,
} from './segments';
import { computeCoverage, type Coverage } from './coverage';
import { VISIT_TYPES } from './visits';

// ══════════════════════════════════════════════════════════════════════
// Данные для карты клиентов: сборка WHERE, расчёт состояний, GeoJSON.
//
// Живёт отдельно от route.ts по той же причине, что и card.ts: Next.js
// разрешает экспортировать из роута только HTTP-обработчики, а проверять
// хочется чистые функции, а не запрос целиком.
//
// Ответ — сразу FeatureCollection: MapLibre принимает его как есть
// (`source.setData(json)`), без промежуточной конвертации на клиенте.
// ══════════════════════════════════════════════════════════════════════

/**
 * Выше этого числа карта перестаёт быть картой. Молча обрезать нельзя —
 * владелец решит, что половины клиентов не существует, — поэтому роут
 * отвечает отказом и просит сузить фильтр.
 */
export const MAX_FEATURES = 10_000;

/** Целых суток с даты до `now`. undefined остаётся null — «не были ни разу». */
function daysSince(at: Date | undefined, now: Date): number | null {
  if (!at) return null;
  return Math.max(0, Math.floor((now.getTime() - at.getTime()) / 86_400_000));
}

/** Короткие ключи: свойство повторяется на каждой точке, и на тысячах
 *  штук разница между `totalSpent` и `sp` — сотни килобайт трафика.
 *  Расшифровка одна на весь проект и лежит здесь. */
export interface MapPointProps {
  /** name — имя или компания */
  n: string;
  /** type — b2b | b2c */
  t: string;
  /** state — состояние отношений */
  st: SegmentState;
  /** spent — всего потрачено */
  sp: number;
  /** ordersCount */
  oc: number;
  /** daysSinceLastOrder, null если заказов не было */
  dl: number | null;
  /** overdueRatio */
  ov: number | null;
  /** valueTier — размер точки */
  vt: ValueTier;
  /** district slug */
  d: string | null;
  /** companyType — тип заведения: restaurant | cafe | toyxona | fitness | … */
  ct: string | null;
  /** audience — female | male | mixed. null = не выяснено */
  au: string | null;
  /** geoSource — 2gis | google | yandex | manual | seed */
  gs: string | null;
  /** phone — набрать прямо с карты, без ожидания карточки */
  ph: string | null;
  /** address — куда именно ехать; в карточке он есть, а на карте не было */
  ad: string | null;
  /** geoPrecision — exact | street | district | city. Точность координаты */
  gp: string | null;
  /** lastVisit — дней с последнего визита. null = не были ни разу */
  lv: number | null;
  /** kind — customer | restaurant */
  k: 'customer' | 'restaurant';
  /** tier заведения: premium | traditional | cafe | tourist. Только у проспектов. */
  tr?: string | null;
}

export interface MapFeature {
  type: 'Feature';
  /** Верхний уровень, а не properties: без него не работает setFeatureState,
   *  которым список подсвечивает точку при наведении. */
  id: number;
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: MapPointProps;
}

export interface UnplacedCustomer {
  id: number;
  name: string;
  city: string;
  address: string | null;
  ordersCount: number;
  totalSpent: number;
  lastOrderDate: string | null;
  state: SegmentState;
  /** Тип заведения: в лотке он подсказывает, где искать адрес. */
  companyType: string | null;
}

/**
 * Район в разрезе: сколько клиентов, сколько денег, сколько проблемных.
 *
 * Это замена хороплету, а не его черновик. Заливка полигонов требует
 * границ районов, а свободного ODbL-экстракта у нас в репозитории нет
 * (готовый популярный набор лежит под GPL-3.0 и в проект не годится).
 * Список отвечает на тот же вопрос — «где недобираем» — и вдобавок
 * называет цифры, которые с заливки пришлось бы считывать на глаз.
 */
export interface DistrictStat {
  district: string;
  customers: number;
  revenue: number;
  /** Клиентов в состоянии at_risk или lost. */
  atRisk: number;
  /** Заведений-целей, которым ещё не продали. */
  prospects: number;
  /**
   * Состав района по типам заведений: {toyxona: 40, fitness: 7, …}.
   *
   * Без него разрез отвечает «в Ургуте 47 точек» — число, из которого не
   * следует ни одного решения. С ним видно, что сорок из них тойхоны, и
   * ясно, с каким предложением туда ехать.
   */
  byCategory: Record<string, number>;
}

export interface MapCollection {
  type: 'FeatureCollection';
  features: MapFeature[];
  summary: {
    total: number;
    placed: number;
    unplaced: number;
    byState: Record<SegmentState, number>;
    revenueByState: Record<SegmentState, number>;
    spentPercentiles: { p50: number; p80: number };
    /** Заведений-целей на карте. Есть только когда запрошен слой проспектов. */
    prospects?: number;
    /** Разрез по районам, от худшего покрытия к лучшему. */
    districts: DistrictStat[];
    /**
     * Готовность карты к поездке: точных / примерных / без координат.
     *
     * Считается по ВСЕЙ выборке, включая тех, кто в лоток не попал:
     * «на карте 812 из 947» отвечает, сколько точек нарисовано, а не по
     * скольким можно поехать.
     */
    coverage: Coverage;
  };
  unplaced: UnplacedCustomer[];
}

export interface MapFilters {
  city?: string | null;
  district?: string | null;
  type?: string | null;
  states?: string | null;
  minSpent?: string | null;
  maxSpent?: string | null;
  source?: string | null;
  companyType?: string | null;
  audience?: string | null;
}

/**
 * Фильтры → Prisma WHERE.
 *
 * Состояния здесь НЕ фильтруются: они вычисляются из ритма заказов, и
 * повторить эту формулу в SQL значит завести вторую реализацию, которая
 * однажды разойдётся с первой. Отбор по состоянию идёт после расчёта.
 */
export function buildMapWhere(filters: MapFilters): Prisma.CustomerWhereInput {
  const where: Prisma.CustomerWhereInput = {};

  const citySlug = normalizeCity(filters.city ?? null);
  if (citySlug) {
    // Сравниваем перечислением написаний, а не одним значением: в базе
    // соседствуют "Samarqand", "samarkand" и «Самарканд».
    //
    // Район добавлен вторым условием вместе с обходом области. Список
    // написаний перечислить целиком нельзя: заведение из Каттакургана
    // приходит от провайдера то как «Kattaqoʻrgʻon», то как
    // «Каттакурганский р-н», и любое пропущенное написание молча роняет
    // точку из фильтра. Slug района канонический по построению, поэтому
    // он ловит то, что не поймал город.
    const districts = districtsOfCity(citySlug).map((d) => d.slug);
    where.OR = [
      { city: { in: citySpellings(citySlug), mode: 'insensitive' } },
      { district: { in: districts } },
    ];
  }

  // Тот же справочник, что у списка: карта и список обязаны понимать
  // параметр одинаково, иначе клик по району в разрезе даёт один набор
  // точек, а тот же район в списке — другой.
  if (isDistrict(filters.district)) where.district = filters.district;
  if (filters.type === 'b2b' || filters.type === 'b2c') where.customerType = filters.type;
  if (filters.source) where.source = filters.source;

  // Тип и аудитория сверяются со справочником, а не подставляются как есть:
  // произвольная строка в фильтре даёт пустую карту, неотличимую от «здесь
  // никого нет».
  if (isCompanyType(filters.companyType)) where.companyType = filters.companyType;
  // 'unknown' — это рабочая очередь продавца: заведения, у которых пол зала
  // ещё предстоит спросить. Отдельное значение, а не отсутствие фильтра:
  // «покажи всех» и «покажи тех, кого я не знаю» — разные вопросы.
  if (filters.audience === 'unknown') where.audience = null;
  else if (isAudience(filters.audience)) where.audience = filters.audience;

  const min = parseAmount(filters.minSpent);
  const max = parseAmount(filters.maxSpent);
  const spent: Prisma.DecimalFilter = {};
  if (min !== null) spent.gte = min;
  if (max !== null) spent.lte = max;
  if (spent.gte !== undefined || spent.lte !== undefined) where.totalSpent = spent;

  return where;
}

/**
 * Строка запроса → число, либо null, если параметра не было.
 *
 * Отдельная функция, а не Number() по месту: `searchParams.get()` отдаёт
 * `null` для отсутствующего параметра, а `Number(null)` — это ноль, а не
 * NaN. На проверке `Number.isFinite` ноль проходит как заданное значение,
 * и запрос без единого фильтра превращался в `totalSpent BETWEEN 0 AND 0`.
 * Карта показывала ровно тех, кто не потратил ничего, — то есть почти
 * никого, и выглядело это как «данных нет».
 */
function parseAmount(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** `state=at_risk,lost` → набор состояний. Пусто или мусор — не фильтруем. */
export function parseStates(raw: string | null | undefined): Set<SegmentState> | null {
  if (!raw) return null;
  const wanted = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is SegmentState => (SEGMENT_STATES as readonly string[]).includes(s));
  return wanted.length > 0 ? new Set(wanted) : null;
}

function emptyCounters(): Record<SegmentState, number> {
  return Object.fromEntries(SEGMENT_STATES.map((s) => [s, 0])) as Record<SegmentState, number>;
}

/** Клиент из выборки — ровно те поля, что нужны карте. */
type MapCustomerRow = {
  id: number;
  name: string | null;
  companyName: string | null;
  city: string;
  address: string | null;
  district: string | null;
  customerType: string;
  companyType: string | null;
  audience: string | null;
  ordersCount: number;
  totalSpent: Prisma.Decimal | number;
  lastOrderDate: Date | null;
  latitude: number | null;
  longitude: number | null;
  geoSource: string | null;
  phone: string | null;
  geoPrecision: string | null;
};

/**
 * Собирает коллекцию точек. `now` инъектируется ради теста, `firstOrders` —
 * ради одного запроса вместо N: даты первых заказов берутся groupBy'ем по
 * всей выборке разом.
 */
export function buildMapCollection(
  customers: MapCustomerRow[],
  firstOrders: Map<number, Date>,
  options: { states?: Set<SegmentState> | null; now?: Date; visits?: Map<number, Date> } = {},
): MapCollection {
  const now = options.now ?? new Date();
  const visits = options.visits ?? new Map<number, Date>();
  const percentiles = spentPercentiles(customers.map((c) => Number(c.totalSpent || 0)));

  const features: MapFeature[] = [];
  const unplaced: UnplacedCustomer[] = [];
  const byState = emptyCounters();
  const revenueByState = emptyCounters();

  for (const c of customers) {
    const spent = Number(c.totalSpent || 0);
    const segment = computeSegment({
      lastOrderDate: c.lastOrderDate,
      firstOrderDate: firstOrders.get(c.id) ?? null,
      ordersCount: c.ordersCount,
      customerType: c.customerType,
      now,
    });

    if (options.states && !options.states.has(segment.state)) continue;

    byState[segment.state] += 1;
    revenueByState[segment.state] += spent;

    const name = c.companyName || c.name || 'Без имени';

    if (c.latitude === null || c.longitude === null) {
      unplaced.push({
        id: c.id,
        name,
        city: c.city,
        address: c.address,
        ordersCount: c.ordersCount,
        totalSpent: spent,
        lastOrderDate: c.lastOrderDate ? c.lastOrderDate.toISOString() : null,
        state: segment.state,
        companyType: c.companyType,
      });
      continue;
    }

    features.push({
      type: 'Feature',
      id: c.id,
      // GeoJSON требует долготу ПЕРВОЙ. Перепутанный порядок — самая частая
      // ошибка в геоданных, и она молча уносит Ташкент в Индийский океан.
      geometry: { type: 'Point', coordinates: [c.longitude, c.latitude] },
      properties: {
        n: name,
        t: c.customerType,
        st: segment.state,
        sp: spent,
        oc: c.ordersCount,
        dl: segment.daysSince === null ? null : Math.round(segment.daysSince),
        ov: segment.overdueRatio === null ? null : Number(segment.overdueRatio.toFixed(2)),
        vt: valueTier(spent, percentiles),
        d: c.district,
        ct: c.companyType,
        au: c.audience,
        gs: c.geoSource,
        ph: c.phone,
        ad: c.address,
        gp: c.geoPrecision,
        lv: daysSince(visits.get(c.id), now),
        k: 'customer',
      },
    });
  }

  return {
    type: 'FeatureCollection',
    features,
    summary: {
      total: features.length + unplaced.length,
      placed: features.length,
      unplaced: unplaced.length,
      byState,
      revenueByState,
      spentPercentiles: percentiles,
      districts: districtStats(features),
      coverage: computeCoverage(customers),
    },
    unplaced,
  };
}

/**
 * Разрез по районам. Сортировка — от худшего к лучшему: сверху район, где
 * больше всего проблемных клиентов, потом где меньше всего выручки.
 * Владельцу нужен список дел, а не алфавитный справочник.
 *
 * Клиенты без района не выдумываются в «прочее»: если район не определён,
 * строки просто нет — пустая категория выглядела бы как реальная территория.
 */
export function districtStats(features: MapFeature[]): DistrictStat[] {
  const byDistrict = new Map<string, DistrictStat>();

  for (const f of features) {
    const key = f.properties.d;
    if (!key) continue;

    const stat = byDistrict.get(key) ?? {
      district: key,
      customers: 0,
      revenue: 0,
      atRisk: 0,
      prospects: 0,
      byCategory: {},
    };

    // Состав считаем по ВСЕМ точкам района, и клиентам, и целям: вопрос
    // «чего здесь много» не про то, купили они уже или нет.
    const category = f.properties.ct;
    if (category) stat.byCategory[category] = (stat.byCategory[category] ?? 0) + 1;

    if (f.properties.k === 'restaurant') {
      stat.prospects += 1;
    } else {
      stat.customers += 1;
      stat.revenue += f.properties.sp;
      if (f.properties.st === 'at_risk' || f.properties.st === 'lost') stat.atRisk += 1;
    }

    byDistrict.set(key, stat);
  }

  return [...byDistrict.values()].sort(
    (a, b) => b.atRisk - a.atRisk || a.revenue - b.revenue,
  );
}

/** Заведение из справочника, ещё не ставшее клиентом. */
export interface ProspectRow {
  id: string;
  name: string;
  city: string;
  tier: string;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  geoSource: string | null;
  customerId: number | null;
}

/**
 * Проспекты в фичи карты — «белые пятна» территории.
 *
 * Заведения со связкой `customerId` отбрасываются: они уже наши клиенты и
 * нарисованы своим пином с настоящим состоянием. Без этой отсечки один
 * ресторан появлялся бы на карте дважды — как клиент и как цель, — и
 * отчёт «в Чиланзаре 14 целей и 2 клиента» считал бы клиентов дважды.
 */
export function buildProspectFeatures(rows: ProspectRow[]): MapFeature[] {
  const features: MapFeature[] = [];
  let syntheticId = -1;

  for (const r of rows) {
    if (r.customerId !== null) continue;
    if (r.latitude === null || r.longitude === null) continue;

    features.push({
      type: 'Feature',
      // У заведений id строковый (cuid), а MapLibre для setFeatureState
      // требует число. Выдаём отрицательные — с id клиентов не столкнутся.
      id: syntheticId,
      geometry: { type: 'Point', coordinates: [r.longitude, r.latitude] },
      properties: {
        n: r.name,
        t: 'prospect',
        st: 'prospect',
        sp: 0,
        oc: 0,
        dl: null,
        ov: null,
        vt: 'low',
        d: r.district,
        // Заведения из справочника журнала — всегда рестораны: таблица
        // `restaurants` заводилась под них и других там не бывает.
        ct: 'restaurant',
        au: null,
        gs: r.geoSource,
        // Телефона и адреса у цели нет: справочник журнала их не хранит.
        // Пустое честнее выдуманного — по такому адресу поехали бы.
        ph: null,
        ad: null,
        gp: null,
        lv: null,
        k: 'restaurant',
        tr: r.tier,
      },
    });
    syntheticId -= 1;
  }

  return features;
}

/** Поля, которые карта читает из БД. Держим узкими: строк тысячи. */
export const MAP_CUSTOMER_SELECT = {
  id: true,
  name: true,
  companyName: true,
  city: true,
  address: true,
  district: true,
  customerType: true,
  companyType: true,
  audience: true,
  ordersCount: true,
  totalSpent: true,
  lastOrderDate: true,
  latitude: true,
  longitude: true,
  geoSource: true,
  // Телефон и точность координаты — ради поля. Телефон раньше приезжал
  // отдельным запросом карточки: в подвале ресторана, на плохой связи,
  // кнопка «позвонить» появлялась через секунды после нажатия на точку.
  // На тысяче точек это два десятка лишних байт, а не запрос.
  phone: true,
  geoPrecision: true,
} satisfies Prisma.CustomerSelect;

/**
 * Даты первых заказов одним запросом. Отменённые не в счёт: заказ, которого
 * не случилось, не задаёт ритм — та же оговорка, что в recalc_customer_stats.
 */
export async function loadFirstOrderDates(ids: number[]): Promise<Map<number, Date>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.crmOrder.groupBy({
    by: ['customerId'],
    where: { customerId: { in: ids }, status: { not: 'cancelled' } },
    _min: { createdAt: true },
  });
  const map = new Map<number, Date>();
  for (const row of rows) {
    if (row._min.createdAt) map.set(row.customerId, row._min.createdAt);
  }
  return map;
}

/**
 * Дата последнего визита по каждому клиенту — одним запросом.
 *
 * Без неё карта показывает, КУДА ехать, но не помнит, что там уже были:
 * через неделю объезда это вопрос «я к ним заезжал или собирался?», на
 * который отвечает только память. Тот же приём, что у первых заказов:
 * groupBy вместо N запросов.
 */
export async function loadLastVisits(ids: number[]): Promise<Map<number, Date>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.interaction.groupBy({
    by: ['customerId'],
    where: { customerId: { in: ids }, interactionType: { in: VISIT_TYPES } },
    _max: { createdAt: true },
  });
  const map = new Map<number, Date>();
  for (const row of rows) {
    if (row.customerId !== null && row._max.createdAt) {
      map.set(row.customerId, row._max.createdAt);
    }
  }
  return map;
}

/** Границы Узбекистана с запасом. Ловит перепутанные местами lat/lon. */
const UZ_BOUNDS = { minLat: 37, maxLat: 46, minLon: 55, maxLon: 74 };

export type CoordCheck = { ok: true } | { ok: false; error: string };

/**
 * Проверка координат перед записью. Пара (69.24, 41.31), переставленная
 * местами, формально валидна как широта/долгота — и потому проходит любую
 * проверку диапазонов. Спасает только привязка к стране.
 */
export function validateCoords(latitude: unknown, longitude: unknown): CoordCheck {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return { ok: false, error: 'Координаты должны быть числами' };
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { ok: false, error: 'Координаты должны быть конечными числами' };
  }
  if (latitude < -90 || latitude > 90) {
    return { ok: false, error: 'Широта вне диапазона −90…90' };
  }
  if (longitude < -180 || longitude > 180) {
    return { ok: false, error: 'Долгота вне диапазона −180…180' };
  }
  if (
    latitude < UZ_BOUNDS.minLat ||
    latitude > UZ_BOUNDS.maxLat ||
    longitude < UZ_BOUNDS.minLon ||
    longitude > UZ_BOUNDS.maxLon
  ) {
    return {
      ok: false,
      error: 'Точка вне Узбекистана — возможно, широта и долгота переставлены местами',
    };
  }
  return { ok: true };
}

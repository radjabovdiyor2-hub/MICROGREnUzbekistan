// ══════════════════════════════════════════════════════════════════════
// Состояние отношений с клиентом — с оглядкой на ЕГО собственный ритм.
//
// В офисе «давно не заказывал» до сих пор означает плоские 30 дней
// (shared/capabilities.py, сегмент `inactive`). Для HoReCa это неверно
// сразу в обе стороны: ресторан, берущий зелень каждый понедельник, надо
// спасать на 15-й день молчания, а тот, кто закупается раз в квартал, на
// 15-й день совершенно здоров. Поэтому давность меряется не в днях, а в
// «просрочках» — во сколько раз пауза длиннее обычной паузы этого клиента.
//
// Состояние НЕ хранится в базе. `customers.status` для этого не годится:
// и recalc_customer_stats (web_office/main.py), и customer_repo.upsert
// гарантируют, что active/vip никогда не понижаются — иначе заказ с сайта
// затирал бы работу отдела продаж. Значит статус монотонен, а состояние
// обязано уметь ухудшаться. Это разные величины, и смешивать их нельзя.
//
// Ценность клиента — отдельная ось (`valueTier`), а не оттенок той же
// шкалы. На карте цвет отвечает за состояние, размер точки — за деньги;
// смешать их в одном канале значит потерять оба сигнала.
// ══════════════════════════════════════════════════════════════════════

export const SEGMENT_STATES = [
  'prospect',
  'new',
  'healthy',
  'slipping',
  'at_risk',
  'lost',
] as const;

export type SegmentState = (typeof SEGMENT_STATES)[number];

export interface SegmentMeta {
  ru: string;
  uz: string;
  /** Токен дизайн-системы, а не цвет: захардкоженных цветов в проекте нет. */
  token: string;
  /** Порядок в легенде: от здоровых к потерянным. */
  order: number;
}

export const SEGMENT_META: Record<SegmentState, SegmentMeta> = {
  prospect: { ru: 'Потенциальный', uz: 'Potensial', token: 'var(--text-muted)', order: 0 },
  new: { ru: 'Новый', uz: 'Yangi', token: 'var(--info)', order: 1 },
  healthy: { ru: 'Активный', uz: 'Faol', token: 'var(--success)', order: 2 },
  slipping: { ru: 'Замедлился', uz: 'Sekinlashdi', token: 'var(--cat-6)', order: 3 },
  at_risk: { ru: 'Под угрозой', uz: 'Xavf ostida', token: 'var(--warning)', order: 4 },
  lost: { ru: 'Потерян', uz: 'Yoʻqolgan', token: 'var(--error)', order: 5 },
};

/** Ритм по умолчанию, когда заказов слишком мало для расчёта. */
const DEFAULT_CADENCE_DAYS = { b2b: 14, b2c: 21 } as const;

/** Границы «просрочки». Ровно 1.0 — ещё здоров, всё выше — уже нет. */
const RATIO_SLIPPING = 1;
const RATIO_AT_RISK = 2;
const RATIO_LOST = 4;

/**
 * Рамки расчётного ритма. Нижняя отсекает всплеск (десять заказов за день
 * не означают, что клиент обязан заказывать каждые три часа), верхняя —
 * вырожденный случай «три заказа за пять лет», где любая пауза нормальна.
 */
const CADENCE_MIN_DAYS = 3;
const CADENCE_MAX_DAYS = 90;

/** Сколько заказов и дней клиент считается «новым», пока идёт в графике. */
const NEW_MAX_ORDERS = 2;
const NEW_WINDOW_DAYS = 30;

const MS_PER_DAY = 86_400_000;

export interface SegmentInput {
  /** ISO-строка или null. Ведётся зеркалом заказов в crm_orders. */
  lastOrderDate: string | Date | null;
  /** MIN(crm_orders.created_at) без отменённых. null — если заказов нет. */
  firstOrderDate: string | Date | null;
  ordersCount: number;
  customerType: string;
  /** Инъекция времени: без неё тест протухнет вместе с календарём. */
  now?: Date;
}

export interface SegmentResult {
  state: SegmentState;
  /** Обычная пауза между заказами этого клиента, в днях. */
  cadenceDays: number;
  /** Дней с последнего заказа. null — заказов не было. */
  daysSince: number | null;
  /** daysSince / cadenceDays. null — заказов не было. */
  overdueRatio: number | null;
}

function toDate(value: string | Date | null): Date | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / MS_PER_DAY);
}

/**
 * Обычная пауза между заказами клиента.
 *
 * Считается по среднему интервалу, а не по медиане: медиана требует всех дат
 * заказов, то есть отдельного запроса на каждого клиента, а карте нужны
 * тысячи разом. MIN/MAX/COUNT берутся одним groupBy, и на выборках до
 * полусотни заказов разница между средним и медианой роли не играет.
 */
export function cadenceDays(input: {
  firstOrderDate: string | Date | null;
  lastOrderDate: string | Date | null;
  ordersCount: number;
  customerType: string;
}): number {
  const fallback =
    input.customerType === 'b2b' ? DEFAULT_CADENCE_DAYS.b2b : DEFAULT_CADENCE_DAYS.b2c;

  const first = toDate(input.firstOrderDate);
  const last = toDate(input.lastOrderDate);
  if (input.ordersCount < 3 || !first || !last) return fallback;

  const tenure = daysBetween(first, last);
  if (tenure <= 0) return CADENCE_MIN_DAYS;

  return clamp(tenure / (input.ordersCount - 1), CADENCE_MIN_DAYS, CADENCE_MAX_DAYS);
}

/**
 * Состояние отношений с клиентом.
 *
 * Порядок проверок важен: сначала просрочка, потом «новизна». Иначе клиент
 * с единственным заказом навсегда застрял бы в «Новых» — у него first и last
 * совпадают, стаж равен нулю, и любое правило вида «стаж меньше ритма»
 * срабатывает даже спустя год молчания. Поэтому «Новый» здесь — частный
 * случай здорового: молодые отношения, которые пока идут по графику.
 */
export function computeSegment(input: SegmentInput): SegmentResult {
  const now = input.now ?? new Date();
  const cadence = cadenceDays(input);
  const last = toDate(input.lastOrderDate);

  if (input.ordersCount <= 0 || !last) {
    return { state: 'prospect', cadenceDays: cadence, daysSince: null, overdueRatio: null };
  }

  const daysSince = daysBetween(last, now);
  const overdueRatio = daysSince / cadence;
  const base = { cadenceDays: cadence, daysSince, overdueRatio };

  if (overdueRatio > RATIO_LOST) return { state: 'lost', ...base };
  if (overdueRatio > RATIO_AT_RISK) return { state: 'at_risk', ...base };
  if (overdueRatio > RATIO_SLIPPING) return { state: 'slipping', ...base };

  const first = toDate(input.firstOrderDate) ?? last;
  const isYoung =
    input.ordersCount <= NEW_MAX_ORDERS && daysBetween(first, now) <= NEW_WINDOW_DAYS;

  return { state: isYoung ? 'new' : 'healthy', ...base };
}

/**
 * Куда клиент двигался последний месяц.
 *
 * Самый ценный сигнал — не сегмент сам по себе, а ПЕРЕХОД: «Активный →
 * Под угрозой» дороже, чем «Потерян → Потерян». Первое означает, что
 * отношения рушатся прямо сейчас и их ещё можно спасти; второе — что
 * всё случилось давно.
 *
 * Считается тем же `computeSegment`, но со сдвинутым «сейчас» и обрезанной
 * историей заказов. Поэтому вызывается только там, где заказы уже
 * загружены, — в панели клиента, а не в списке на тысячу строк.
 */
export interface SegmentTrend {
  before: SegmentState;
  after: SegmentState;
  /** Ухудшилось ли положение. Порядок состояний задан SEGMENT_META.order. */
  worsened: boolean;
  improved: boolean;
}

const TREND_WINDOW_DAYS = 30;

/**
 * Шкала риска — НЕ то же самое, что порядок в легенде.
 *
 * В легенде состояния идут от приятных к тревожным, и «Новый» стоит перед
 * «Активным». Но переход «Новый → Активный» — это нормальное взросление
 * клиента, а не ухудшение: сравнение по порядку легенды объявляло бы его
 * падением и заваливало владельца ложными тревогами. Здесь «Новый» и
 * «Активный» стоят на одной ступени, потому что оба означают «всё хорошо».
 */
const RISK_RANK: Record<SegmentState, number> = {
  prospect: 0,
  new: 1,
  healthy: 1,
  slipping: 2,
  at_risk: 3,
  lost: 4,
};

export function computeTrend(input: {
  /** Даты заказов, ISO. Порядок любой. */
  orderDates: (string | Date)[];
  customerType: string;
  now?: Date;
}): SegmentTrend | null {
  const now = input.now ?? new Date();
  const past = new Date(now.getTime() - TREND_WINDOW_DAYS * MS_PER_DAY);

  const dates = input.orderDates
    .map((d) => toDate(d))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  if (dates.length === 0) return null;

  const before = dates.filter((d) => d <= past);
  // Месяц назад клиента ещё не существовало — сравнивать не с чем.
  if (before.length === 0) return null;

  const at = (list: Date[], moment: Date) =>
    computeSegment({
      firstOrderDate: list[0],
      lastOrderDate: list[list.length - 1],
      ordersCount: list.length,
      customerType: input.customerType,
      now: moment,
    }).state;

  const wasState = at(before, past);
  const nowState = at(dates, now);

  return {
    before: wasState,
    after: nowState,
    worsened: RISK_RANK[nowState] > RISK_RANK[wasState],
    improved: RISK_RANK[nowState] < RISK_RANK[wasState],
  };
}

export type ValueTier = 'low' | 'mid' | 'top';

/**
 * Ценность клиента для размера точки на карте. Пороги — перцентили текущей
 * выборки, а не абсолютные суммы: «крупный» в Самарканде и в Ташкенте это
 * разные деньги, и зашивать константу значит соврать в одном из городов.
 */
export function valueTier(
  totalSpent: number,
  percentiles: { p50: number; p80: number },
): ValueTier {
  if (totalSpent >= percentiles.p80 && percentiles.p80 > 0) return 'top';
  if (totalSpent >= percentiles.p50 && percentiles.p50 > 0) return 'mid';
  return 'low';
}

/**
 * Перцентили по возрастающей выборке сумм. Пустая выборка даёт нули —
 * тогда valueTier честно вернёт 'low' всем, а не разделит ничто на квартили.
 */
export function spentPercentiles(amounts: number[]): { p50: number; p80: number } {
  if (amounts.length === 0) return { p50: 0, p80: 0 };
  const sorted = [...amounts].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  return { p50: at(0.5), p80: at(0.8) };
}

/**
 * Человеческое объяснение вместо ярлыка: «Последний заказ 41 день назад при
 * обычных 14 — просрочка ×2.9». Ярлык говорит ЧТО, объяснение — ПОЧЕМУ, и
 * второе владелец может проверить глазами.
 */
export function explainSegment(result: SegmentResult, lang: 'ru' | 'uz'): string {
  if (result.daysSince === null || result.overdueRatio === null) {
    return lang === 'ru' ? 'Заказов ещё не было' : 'Hali buyurtma boʻlmagan';
  }
  const days = Math.round(result.daysSince);
  const cadence = Math.round(result.cadenceDays);
  const ratio = result.overdueRatio.toFixed(1);

  return lang === 'ru'
    ? `Последний заказ ${days} дн. назад при обычных ${cadence} — просрочка ×${ratio}`
    : `Oxirgi buyurtma ${days} kun oldin, odatdagi ${cadence} kun — kechikish ×${ratio}`;
}

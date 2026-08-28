import { distanceKm, type Coords, type RoutePoint } from './dayRoute';

// ══════════════════════════════════════════════════════════════════════
// План объезда на сегодня: кого объехать и в каком порядке.
//
// ЗАЧЕМ. Объезд собирался вручную: продавец тыкал по карте «заеду сюда,
// сюда и сюда». Это работает, когда знаешь базу наизусть, и не работает,
// когда клиентов пятьсот. В итоге ездили к тем, кого помнят, — то есть к
// тем, кто и так покупает, — а просроченные тихо уходили.
//
// ЧТО СЧИТАЕТСЯ ХОРОШИМ ПЛАНОМ
//
// Не «ближайшие» и не «самые просроченные», а их сочетание. Ближайшие — это
// день, потраченный на соседний квартал. Самые просроченные — это день,
// потраченный на дорогу через город. Поэтому вес складывается из двух
// частей, и обе нормированы, чтобы одна не задавила другую.
//
// ПЛАН — ПРЕДЛОЖЕНИЕ, А НЕ ПРИКАЗ
//
// Тот же принцип, что у сортировки объезда: человек знает про обед на кухне
// и про то, что к одним лучше заезжать с утра. Поэтому план кладётся в
// обычный объезд, где его можно поправить, выкинуть остановку и добавить
// свою. Автоматика за спиной здесь запрещена.
// ══════════════════════════════════════════════════════════════════════

/** Кандидат в план: то, что карта знает о точке без похода в базу. */
export interface PlanCandidate extends RoutePoint {
  /** Состояние: prospect | new | healthy | slipping | at_risk | lost. */
  state: string;
  /** Во сколько раз просрочен обычный ритм заказов. null — ритма нет. */
  overdueRatio: number | null;
  /** Дней с последнего визита. null — не были ни разу. */
  lastVisitDays: number | null;
}

/**
 * Сколько дней подряд не заезжаем повторно.
 *
 * Съездил вчера — сегодня туда не надо, даже если формально «пора»: у
 * заведения не появилось новых потребностей за сутки, а повторный заход
 * читается как назойливость.
 */
export const COOLDOWN_DAYS = 3;

/** Сколько остановок в дне. Столько же держит ссылка в навигатор. */
export const PLAN_SIZE = 8;

/**
 * Насколько далеко имеет смысл ехать.
 *
 * За этой границей поездка съедает день целиком, и такой клиент — повод для
 * отдельного выезда, а не строчка в обычном объезде.
 */
export const MAX_REACH_KM = 25;

/** Срочность по состоянию: чем ближе к потере, тем нужнее заехать. */
const STATE_URGENCY: Record<string, number> = {
  at_risk: 1,
  lost: 0.9,
  slipping: 0.75,
  // Потенциальный — это дверь, в которую ещё не заходили. Ниже
  // просроченных, но выше здоровых: к здоровому ехать незачем, он и так
  // заказывает.
  prospect: 0.5,
  new: 0.25,
  healthy: 0.1,
};

/**
 * Вес кандидата: срочность против расстояния.
 *
 * Расстояние нормируется на MAX_REACH_KM, поэтому обе части лежат в [0; 1] и
 * ни одна не задавит другую случайно — а не потому, что «километры больше
 * единиц срочности».
 */
export function planScore(candidate: PlanCandidate, from: Coords | null): number {
  const urgency = STATE_URGENCY[candidate.state] ?? 0.1;

  // Просрочка усиливает срочность, но не отменяет расстояние: клиент,
  // просроченный втрое, важнее просроченного вдвое, а не важнее всего.
  const overdue = Math.min(1, (candidate.overdueRatio ?? 0) / 3);

  const km = from ? distanceKm(from, candidate) : 0;
  const near = 1 - Math.min(1, km / MAX_REACH_KM);

  // Доли подобраны так, чтобы дальний просроченный обходил ближнего
  // здорового, но ближний просроченный шёл первым.
  return urgency * 0.5 + overdue * 0.2 + near * 0.3;
}

/** Годится ли точка в сегодняшний план вообще. */
export function isPlannable(candidate: PlanCandidate, from: Coords | null): boolean {
  if (!Number.isFinite(candidate.latitude) || !Number.isFinite(candidate.longitude)) return false;
  if (candidate.lastVisitDays !== null && candidate.lastVisitDays < COOLDOWN_DAYS) return false;
  if (from && distanceKm(from, candidate) > MAX_REACH_KM) return false;
  return true;
}

/**
 * Собрать план на сегодня.
 *
 * Два шага, и порядок между ними важен. Сначала ОТБОР по весу: кто вообще
 * достоин дня. Потом ПОРЯДОК по близости: как объехать отобранных, не
 * наматывая круги. Сортировать сразу по расстоянию значит собрать соседний
 * квартал; сортировать только по срочности — весь день ехать.
 */
export function buildDayPlan(
  candidates: PlanCandidate[],
  from: Coords | null,
  limit: number = PLAN_SIZE,
): RoutePoint[] {
  const fit = candidates.filter((c) => isPlannable(c, from));
  if (fit.length === 0) return [];

  const chosen = [...fit]
    .sort((a, b) => planScore(b, from) - planScore(a, from))
    .slice(0, limit);

  // Порядок объезда — жадный «ближайший следующий» от старта. Тот же
  // приём, что у кнопки «упорядочить по близости», и намеренно тот же:
  // два разных порядка в одном экране путали бы.
  const rest = chosen.map((c) => ({
    id: c.id,
    name: c.name,
    latitude: c.latitude,
    longitude: c.longitude,
  }));
  const ordered: RoutePoint[] = [];
  let cursor: Coords = from ?? rest[0];

  while (rest.length > 0) {
    let bestAt = 0;
    let bestKm = Infinity;
    for (let i = 0; i < rest.length; i++) {
      const km = distanceKm(cursor, rest[i]);
      if (km < bestKm) {
        bestKm = km;
        bestAt = i;
      }
    }
    const next = rest.splice(bestAt, 1)[0];
    ordered.push(next);
    cursor = next;
  }

  return ordered;
}

/** Из чего состоит день: сколько новых дверей, сколько своих. */
export interface PlanMix {
  /** Заходы к тем, кто ещё ни разу не заказывал. */
  fresh: number;
  /** Обслуживание тех, кто уже покупал. */
  existing: number;
}

/**
 * Разделить план на новые заходы и обслуживание.
 *
 * ЗАЧЕМ. Это разная работа, и смешивать их в одном счётчике — значит не
 * заметить, как день целиком уходит на своих. Обслуживать привычнее и
 * приятнее: там ждут, там не отказывают. Но новых заведений от этого не
 * прибавляется, а именно они определяют рост.
 *
 * `prospect` — тот, кто ещё ни разу не заказывал (см. `segments.ts`).
 * Остальные состояния, включая «нового», означают уже состоявшегося
 * клиента: у него есть заказы, и заход к нему — удержание, а не поиск.
 */
export function planMix(plan: RoutePoint[], candidates: PlanCandidate[]): PlanMix {
  const stateById = new Map(candidates.map((c) => [c.id, c.state]));

  let fresh = 0;
  for (const point of plan) {
    if (stateById.get(point.id) === 'prospect') fresh += 1;
  }

  return { fresh, existing: plan.length - fresh };
}


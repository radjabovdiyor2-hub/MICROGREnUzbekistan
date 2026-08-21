// ══════════════════════════════════════════════════════════════════════
// Объезд на день: набрать точек на карте и поехать по ним.
//
// Это НЕ то же самое, что `deliveryRoutes`. Там маршрут доставки, который
// человек спланировал заранее и который карта обязана показывать ровно так,
// как он задуман (см. комментарий про orderIndex в том файле). Здесь —
// черновик на сегодня: продавец тыкает по карте «заеду сюда, сюда и сюда»,
// и ему нужна одна ссылка в навигатор.
//
// Порядок предлагается, а не навязывается. «Оптимизированный» маршрут,
// подставленный молча, ломает замысел: человек знает про обед на кухне и
// про то, что к одним лучше заезжать с утра. Поэтому есть кнопка
// «упорядочить по близости», а не автоматика за спиной.
// ══════════════════════════════════════════════════════════════════════

export interface RoutePoint {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
}

/**
 * Потолок остановок в одной ссылке.
 *
 * У Google в бесплатном URL API девять промежуточных точек плюс конечная —
 * десять. Яндекс жёсткого предела не объявляет, но длинный `rtext` рвётся
 * на подстановке. Берём общий потолок: лучше честно сказать «больше десяти
 * в один заход не поедет», чем отдать ссылку, которая молча потеряет хвост.
 */
export const MAX_STOPS = 10;

/** Ключ в localStorage: объезд переживает перезагрузку страницы. */
export const DAY_ROUTE_KEY = 'mg-day-route';

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Расстояние по большому кругу, километры.
 *
 * Гаверсинус, а не разница координат: на широте Самарканда градус долготы
 * короче градуса широты почти на четверть, и «ближайшая» точка по сырой
 * дельте регулярно оказывалась бы не ближайшей.
 */
export function distanceKm(a: RoutePoint, b: RoutePoint): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Длина объезда по порядку остановок, километры. */
export function routeLengthKm(stops: RoutePoint[], from?: RoutePoint | null): number {
  const path = from ? [from, ...stops] : stops;
  let total = 0;
  for (let i = 1; i < path.length; i++) total += distanceKm(path[i - 1], path[i]);
  return total;
}

/**
 * Порядок «ближайший следующий» от стартовой точки.
 *
 * Жадный алгоритм, а не полный перебор: оптимальный объезд — это задача
 * коммивояжёра, а на десяти точках жадный даёт результат в пределах
 * четверти от лучшего за микросекунды. Человеку всё равно предстоит
 * поправить порядок руками, и точность здесь дешевле скорости.
 *
 * `from` — где человек сейчас. Без него стартуем с первой выбранной точки:
 * подставлять центр города значило бы строить маршрут от места, где никого
 * нет.
 */
export function orderByProximity(stops: RoutePoint[], from?: RoutePoint | null): RoutePoint[] {
  if (stops.length < 2) return [...stops];

  const rest = [...stops];
  const ordered: RoutePoint[] = [];
  let cursor = from ?? rest.shift()!;
  if (!from) ordered.push(cursor);

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
    cursor = rest.splice(bestAt, 1)[0];
    ordered.push(cursor);
  }

  return ordered;
}

/** Добавить точку в конец, не пустив дубль и не перевалив за потолок. */
export function addStop(stops: RoutePoint[], point: RoutePoint): RoutePoint[] {
  if (stops.some((s) => s.id === point.id)) return stops;
  if (stops.length >= MAX_STOPS) return stops;
  return [...stops, point];
}

export function removeStop(stops: RoutePoint[], id: number): RoutePoint[] {
  return stops.filter((s) => s.id !== id);
}

/** Сдвинуть остановку на шаг. Край списка — не ошибка, просто некуда. */
export function moveStop(stops: RoutePoint[], id: number, delta: -1 | 1): RoutePoint[] {
  const at = stops.findIndex((s) => s.id === id);
  if (at < 0) return stops;
  const to = at + delta;
  if (to < 0 || to >= stops.length) return stops;

  const next = [...stops];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}

/**
 * Разбор сохранённого объезда.
 *
 * Читается то, что лежало в localStorage вчера, — то есть что угодно.
 * Кривую запись молча выбрасываем: объезд не та ценность, ради которой
 * стоит показывать человеку разбор ошибок хранилища.
 */
export function parseStops(raw: string | null): RoutePoint[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s): s is RoutePoint =>
          typeof s === 'object' &&
          s !== null &&
          typeof (s as RoutePoint).id === 'number' &&
          typeof (s as RoutePoint).name === 'string' &&
          Number.isFinite((s as RoutePoint).latitude) &&
          Number.isFinite((s as RoutePoint).longitude),
      )
      .slice(0, MAX_STOPS);
  } catch {
    return [];
  }
}

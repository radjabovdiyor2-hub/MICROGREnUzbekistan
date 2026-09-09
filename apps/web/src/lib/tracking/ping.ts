import { metersBetween } from '@/lib/customers/visitProof';
import { formatLocalDate } from '@/lib/localDate';

// ══════════════════════════════════════════════════════════════════════
// Крошки трека: разбор пачки и то, что из неё следует.
//
// Модуль намеренно ЧИСТЫЙ — ни Prisma, ни fetch, ни Date.now(). Здесь
// живёт вся арифметика дня (путь, время в движении, разрывы связи), и
// проверять её надо без базы: поднимать Postgres ради вопроса «сколько
// метров между тремя точками» значит не проверять его никогда.
//
// Приёмник (`/api/admin/tracking/ping`) отвечает за доступ и запись,
// разбор тела — здесь.
// ══════════════════════════════════════════════════════════════════════

/** Откуда пришла крошка. Больше вариантов не бывает и не должно. */
export const PING_SOURCES = ['telegram_live', 'pwa', 'visit'] as const;
export type PingSource = (typeof PING_SOURCES)[number];

export interface TrackPingInput {
  at: Date;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  source: PingSource;
  speedMps: number | null;
  headingDeg: number | null;
}

/**
 * Сколько крошек принимаем за один запрос.
 *
 * Телефон копит точки, пока нет связи, и присылает их пачкой. Ограничение
 * не от недоверия: без него один запрос с миллионом строк положит запись
 * всем остальным. 500 крошек — это больше суток честной трансляции.
 */
export const MAX_BATCH = 500;

/**
 * Насколько старую крошку принимаем.
 *
 * Столько же держит офлайн-очередь визитов. Смысл тот же: телефон мог
 * пролежать без связи выходные, и терять этот трек незачем, — но «точка
 * из 2019 года» это сбитые часы, а не поездка.
 */
export const MAX_BACKDATE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Разрыв, после которого две крошки перестают быть одним отрезком пути.
 *
 * Больше пяти минут молчания — и прямая между точками уже не описывает
 * дорогу: человек за это время успевает объехать полгорода. Такой отрезок
 * не идёт ни в длину пути, ни во время движения, а показывается разрывом.
 * Иначе трек через весь Самарканд по прямой выглядел бы уликой, хотя это
 * туннель, подвал или севший телефон.
 */
export const GAP_MS = 5 * 60 * 1000;

/**
 * Быстрее этого человек по городу не ездит.
 *
 * Крошку, которая требует такой скорости от предыдущей, отбрасываем: это
 * прыжок GPS, а не поездка. Считать по ней путь значит приписать
 * сотруднику километры, которых он не проезжал, — и обвинить его же
 * потом за расхождение с эталоном.
 */
export const MAX_SPEED_MPS = 55;

/** Ниже этого считаем, что человек стоит, а не едет. */
export const MOVING_SPEED_MPS = 0.7;

function isSource(value: unknown): value is PingSource {
  return typeof value === 'string' && (PING_SOURCES as readonly string[]).includes(value);
}

/**
 * Одна крошка из тела запроса — или `null`, если она негодна.
 *
 * Мусор отбрасываем МОЛЧА и поштучно, а не роняем всю пачку: в ней
 * полдня работы, и один кривой замер не повод потерять остальные. Та же
 * логика, что в `readCoords` у отметки визита: кривая координата хуже
 * отсутствующей, потому что рисует «в 5000 км» и обвиняет числом.
 */
export function readPing(raw: unknown, now: Date): TrackPingInput | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const body = raw as Record<string, unknown>;

  const lat = Number(body.latitude);
  const lon = Number(body.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  // Ноль-ноль — точка в Атлантике, которую отдают эмуляторы и сломанные
  // датчики. Честная координата такой не бывает.
  if (lat === 0 && lon === 0) return null;

  if (!isSource(body.source)) return null;

  const atMs = Number(body.at);
  if (!Number.isFinite(atMs)) return null;
  const nowMs = now.getTime();
  // Будущее не принимаем вовсе, прошлое — в пределах недели. Часы на
  // телефоне уезжают в обе стороны, но «замер из завтра» ломает порядок
  // трека, а не просто смещает его.
  if (atMs > nowMs + 60_000) return null;
  if (atMs < nowMs - MAX_BACKDATE_MS) return null;

  const acc = Number(body.accuracyM);
  const speed = Number(body.speedMps);
  const heading = Number(body.headingDeg);

  return {
    at: new Date(atMs),
    latitude: lat,
    longitude: lon,
    accuracyM: Number.isFinite(acc) && acc >= 0 ? Math.round(acc) : null,
    source: body.source,
    speedMps: Number.isFinite(speed) && speed >= 0 ? speed : null,
    headingDeg: Number.isFinite(heading) && heading >= 0 && heading < 360 ? Math.round(heading) : null,
  };
}

/**
 * Пачка крошек: разобранная, отсортированная по времени и без прыжков.
 *
 * Сортируем ЗДЕСЬ, потому что порядок прихода не гарантирован ничем:
 * офлайн-очередь отдаёт как сложилось, а вся арифметика ниже считает
 * соседние точки соседними во времени.
 */
export function readPingBatch(raw: unknown, now: Date): TrackPingInput[] {
  if (!Array.isArray(raw)) return [];

  const parsed: TrackPingInput[] = [];
  for (const item of raw.slice(0, MAX_BATCH)) {
    const ping = readPing(item, now);
    if (ping) parsed.push(ping);
  }
  parsed.sort((a, b) => a.at.getTime() - b.at.getTime());

  return dropJumps(parsed);
}

/**
 * Выбрасывает крошки, до которых нельзя было доехать.
 *
 * Проверяем от последней ПРИНЯТОЙ точки, а не от предыдущей по списку:
 * иначе один выброс уводит опору в сторону и за ним отбраковывается
 * хвост честных замеров.
 */
export function dropJumps(pings: TrackPingInput[]): TrackPingInput[] {
  const out: TrackPingInput[] = [];
  for (const ping of pings) {
    const prev = out[out.length - 1];
    if (prev) {
      const sec = (ping.at.getTime() - prev.at.getTime()) / 1000;
      // Две крошки в одну секунду сравнивать нечем: любая разница даёт
      // бесконечную скорость. Такую точку пропускаем как дубль.
      if (sec <= 0) continue;
      const speed = metersBetween(prev, ping) / sec;
      if (speed > MAX_SPEED_MPS) continue;
    }
    out.push(ping);
  }
  return out;
}

export interface TrackSummary {
  /** Пройдено метров — без отрезков через разрыв связи. */
  meters: number;
  /** Сколько секунд человек двигался. */
  movingSec: number;
  /** Сколько раз связь пропадала дольше `GAP_MS`. */
  gaps: number;
}

/**
 * Итог по треку: путь, время в движении и число разрывов.
 *
 * Разрывы считаем и показываем отдельно, а не прячем: день с четырьмя
 * дырами по полчаса и день со сплошным треком — разные дни, даже если
 * сумма метров совпала.
 */
export function summarize(pings: TrackPingInput[]): TrackSummary {
  let meters = 0;
  let movingSec = 0;
  let gaps = 0;

  for (let i = 1; i < pings.length; i += 1) {
    const prev = pings[i - 1];
    const cur = pings[i];
    const ms = cur.at.getTime() - prev.at.getTime();
    if (ms > GAP_MS) {
      gaps += 1;
      continue;
    }
    const step = metersBetween(prev, cur);
    meters += step;
    // В движении, только если действительно перемещался: телефон,
    // лежащий на столе, дрожит координатой и за час «набегает» километр.
    if (step / (ms / 1000) >= MOVING_SPEED_MPS) movingSec += Math.round(ms / 1000);
  }

  return { meters, movingSec, gaps };
}

/**
 * Крошки, разложенные по местным суткам.
 *
 * По МЕСТНЫМ, а не по UTC: смена с восьми утра в Самарканде по UTC
 * разъезжается на два дня, и отчёт показал бы половину пути «вчера».
 * Ровно та же ловушка, из-за которой касса и аналитика считали день
 * по-разному (см. `lib/localDate.ts`).
 */
export function groupByLocalDay(pings: TrackPingInput[]): Map<string, TrackPingInput[]> {
  const days = new Map<string, TrackPingInput[]>();
  for (const ping of pings) {
    const key = formatLocalDate(ping.at);
    const bucket = days.get(key);
    if (bucket) bucket.push(ping);
    else days.set(key, [ping]);
  }
  return days;
}

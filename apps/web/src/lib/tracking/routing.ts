import crypto from 'crypto';

import { prisma } from '@repo/database';

// ══════════════════════════════════════════════════════════════════════
// Сколько дорога ДОЛЖНА была занять — с учётом пробок.
//
// Без этого числа сверять не с чем: «ехал сорок минут» само по себе не
// значит ни хорошего, ни плохого, пока неизвестно, сколько там ехать.
//
// КАСКАД — КАК У ГЕОКОДЕРА (`apps/tgas/shared/geo.py::_providers`), и
// порядок тот же: 2GIS первым, потому что по Узбекистану его данные полнее.
// Логику оттуда не импортируем — межмодульный импорт запрещён; повторяется
// только форма: первый ответивший выигрывает, отказ виден.
//
// ЭТАЛОН СЧИТАЕТСЯ НА ЧАС ВЫЕЗДА. Пробки в 8 утра и в 14:00 — разные числа,
// и спросить их «сейчас», открывая отчёт за прошлый вторник, значит
// сравнить факт с чужой дорогой.
//
// ОТКАЗ ВИДЕН. Нет ключа, молчит провайдер — возвращаем null, и в отчёте
// написано «эталон не получен». Ноль здесь читался бы как «дорога занимает
// нисколько» и обвинил бы человека пустотой. Тот же принцип, которого
// конституция требует от AI-движка.
// ══════════════════════════════════════════════════════════════════════

export interface RoutePoint {
  latitude: number;
  longitude: number;
}

export interface RouteEstimate {
  seconds: number;
  meters: number;
  provider: string;
  trafficUsed: boolean;
}

/** Сколько ждём маршрутизатор. Отчёт не должен висеть из-за чужого API. */
const TIMEOUT_MS = 8000;

/**
 * Округление координат для ключа кэша — примерно 11 метров.
 *
 * Без него ключ не совпадёт никогда: пин клиента стоит на месте, а вторая
 * точка плеча приходит из трека и каждый раз чуть другая. Кэш бы рос и не
 * попадал ни разу, то есть был бы платным украшением.
 */
function round(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

function cacheKey(from: RoutePoint, to: RoutePoint, hour: number): string {
  const raw = [round(from.latitude), round(from.longitude), round(to.latitude), round(to.longitude), hour].join(',');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Ответ 2GIS. Берём первый маршрут: альтернативы нас не интересуют —
 * сравниваем с тем, как поехал бы обычный человек.
 */
async function ask2gis(
  from: RoutePoint,
  to: RoutePoint,
  key: string,
): Promise<RouteEstimate | null> {
  const res = await fetch(`https://routing.api.2gis.com/routing/7.0.0/global?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      points: [
        { type: 'stop', lon: from.longitude, lat: from.latitude },
        { type: 'stop', lon: to.longitude, lat: to.latitude },
      ],
      transport: 'driving',
      // Именно ради этого сюда и идём: маршрут по текущей дорожной
      // обстановке, а не по пустому городу.
      route_mode: 'fastest',
      traffic_mode: 'jam',
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return null;

  const body = (await res.json()) as { result?: { total_duration?: number; total_distance?: number }[] };
  const first = body.result?.[0];
  if (!first || typeof first.total_duration !== 'number' || typeof first.total_distance !== 'number') {
    return null;
  }
  return {
    seconds: Math.round(first.total_duration),
    meters: Math.round(first.total_distance),
    provider: '2gis',
    trafficUsed: true,
  };
}

async function askYandex(
  from: RoutePoint,
  to: RoutePoint,
  key: string,
): Promise<RouteEstimate | null> {
  const waypoints = `${from.latitude},${from.longitude}|${to.latitude},${to.longitude}`;
  const url =
    `https://api.routing.yandex.net/v2/route?apikey=${key}` +
    `&waypoints=${encodeURIComponent(waypoints)}&mode=driving`;

  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return null;

  const body = (await res.json()) as {
    route?: { legs?: { status?: string; duration?: number; length?: number }[] };
  };
  const leg = body.route?.legs?.[0];
  if (!leg || typeof leg.duration !== 'number' || typeof leg.length !== 'number') return null;

  return {
    seconds: Math.round(leg.duration),
    meters: Math.round(leg.length),
    provider: 'yandex',
    trafficUsed: true,
  };
}

/**
 * Провайдеры в порядке предпочтения. Пустой список — эталона не будет, и
 * это нормальное состояние стенда без ключей, а не поломка.
 *
 * КЛЮЧ 2ГИС ПЕРЕИСПОЛЬЗУЕТСЯ. Отдельный `DGIS_ROUTING_API_KEY` не нужен:
 * 2ГИС выдаёт один ключ на проект и включает доступ к сервисам галочками,
 * поэтому тот же ключ, которым офис геокодирует адреса
 * (`apps/tgas/shared/geo.py`), отвечает и на запрос маршрута. Проверено
 * живым запросом: маршрут по Самарканду вернулся с HTTP 200, длиной и
 * временем. Требовать второй ключ значило бы держать готовую функцию
 * выключенной из-за переменной, которую некому заполнить.
 *
 * `DGIS_ROUTING_API_KEY` остаётся как ЯВНОЕ переопределение — на случай
 * отдельного ключа под свою квоту, чтобы отчёты не съедали лимит
 * геокодера.
 *
 * У ЯНДЕКСА ТАК НЕЛЬЗЯ, и подстановки для него нет намеренно: там ключ
 * выдаётся на каждый сервис отдельно, и ключ Геокодера в Роутер приедет
 * с 403. Тихая подстановка превратила бы понятное «ключ не задан» в
 * непонятный отказ чужого API.
 */
function providers(): { name: string; ask: (f: RoutePoint, t: RoutePoint) => Promise<RouteEstimate | null> }[] {
  const chain: { name: string; ask: (f: RoutePoint, t: RoutePoint) => Promise<RouteEstimate | null> }[] = [];
  const dgis = process.env.DGIS_ROUTING_API_KEY || process.env.DGIS_API_KEY;
  if (dgis) chain.push({ name: '2gis', ask: (f, t) => ask2gis(f, t, dgis) });
  const yandex = process.env.YANDEX_ROUTER_API_KEY;
  if (yandex) chain.push({ name: 'yandex', ask: (f, t) => askYandex(f, t, yandex) });
  return chain;
}

/**
 * Эталон для плеча. `null` — не получили, и так и надо сказать в отчёте.
 *
 * @param departAt Момент выезда: из него берётся час для пробок и для ключа кэша.
 */
export async function expectedRoute(
  from: RoutePoint,
  to: RoutePoint,
  departAt: Date,
): Promise<RouteEstimate | null> {
  const hour = departAt.getHours();
  const queryHash = cacheKey(from, to, hour);

  const cached = await prisma.routeCache.findUnique({ where: { queryHash } });
  if (cached && cached.seconds !== null && cached.meters !== null) {
    return {
      seconds: cached.seconds,
      meters: cached.meters,
      provider: cached.provider,
      trafficUsed: cached.trafficUsed,
    };
  }

  const chain = providers();
  let lastError = chain.length === 0 ? 'ключи маршрутизатора не заданы' : null;

  for (const provider of chain) {
    try {
      const hit = await provider.ask(from, to);
      if (!hit) {
        lastError = `${provider.name}: пустой ответ`;
        continue;
      }
      await prisma.routeCache.upsert({
        where: { queryHash },
        create: {
          queryHash,
          fromLat: round(from.latitude),
          fromLon: round(from.longitude),
          toLat: round(to.latitude),
          toLon: round(to.longitude),
          hourBucket: hour,
          seconds: hit.seconds,
          meters: hit.meters,
          provider: hit.provider,
          trafficUsed: hit.trafficUsed,
        },
        update: {
          seconds: hit.seconds,
          meters: hit.meters,
          provider: hit.provider,
          trafficUsed: hit.trafficUsed,
          attempts: { increment: 1 },
          lastError: null,
        },
      });
      return hit;
    } catch (error: unknown) {
      lastError = `${provider.name}: ${error instanceof Error ? error.message : 'сбой'}`;
    }
  }

  // Неудачу тоже запоминаем — но БЕЗ чисел, чтобы следующий запрос не
  // принял её за ответ. Счётчик попыток покажет, что провайдер молчит
  // не разово, а стабильно: это разные диагнозы.
  await prisma.routeCache.upsert({
    where: { queryHash },
    create: {
      queryHash,
      fromLat: round(from.latitude),
      fromLon: round(from.longitude),
      toLat: round(to.latitude),
      toLon: round(to.longitude),
      hourBucket: hour,
      provider: 'none',
      lastError,
    },
    update: { attempts: { increment: 1 }, lastError },
  });
  return null;
}

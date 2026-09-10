import { metersBetween } from '@/lib/customers/visitProof';

import { GAP_MS, type TrackPingInput } from './ping';
import { nearestPin, type CustomerPin } from './stays';

// ══════════════════════════════════════════════════════════════════════
// Простой: человек на связи, но не двигается.
//
// ЧЕГО НЕ БЫЛО. Всё, что в этой подсистеме называлось молчанием —
// `silentMin`, `state: 'silent'`, `GAP_MS`, — меряет ОТСУТСТВИЕ СВЯЗИ.
// Телефон, честно транслирующий с дивана, читался как «на связи», и
// вопроса не возникало вовсе. Владелец просил видеть именно этот случай.
//
// ЭТО ДРУГОЕ СОСТОЯНИЕ, А НЕ РАЗНОВИДНОСТЬ МОЛЧАНИЯ. «Стоит 40 минут не у
// клиента» — вопрос к человеку; «связи нет 40 минут» — чаще вопрос к
// телефону. Смешать их значит спросить не о том и не у того, поэтому
// разрыв связи здесь окно простоя ЗАКАНЧИВАЕТ: пока крошек нет, утверждать,
// что человек стоял, нельзя.
//
// МОДУЛЬ ЧИСТЫЙ — ни базы, ни часов, ни настроек: пороги приходят
// аргументами. Это арифметика, по которой заговорят с живым человеком, и
// проверять её надо тестом, а не глазами по карте.
//
// ПРОСТОЙ — НЕ УЛИКА. Сорок минут на месте объясняются обедом, очередью,
// поломкой и разговором. Здесь считается ФАКТ, вывод делает владелец —
// то же правило, что и во всём остальном отчёте дня.
// ══════════════════════════════════════════════════════════════════════

export interface IdleWindow {
  startedAt: Date;
  endedAt: Date;
  idleSec: number;
  /** Где стоял — координата входа в окно, а не среднее по облаку. */
  latitude: number;
  longitude: number;
  /** Крошек внутри. Две точки на сорок минут — это не «стоял», а молчал. */
  pings: number;
}

/** Отрезок времени, который простоем НЕ считается. */
export interface BusyWindow {
  arrivedAt: Date;
  leftAt: Date;
}

/**
 * Чем человек был занят — то, что простоем считать нельзя.
 *
 * ДВА ПРИЗНАКА, А НЕ ОДИН, и оба нужны:
 *   · `pins` — рядом стоит клиент. Работает и там, где заезд ещё не
 *     собран: сторож смотрит на текущий час, когда стоянки этого дня
 *     пересчитывать некому;
 *   · `busy` — уже собранные стоянки. Ловят случай, когда пин заведения
 *     стоит неточно, а человек отметился кнопкой «я на точке».
 *
 * Одного признака мало: сторож в боте и отчёт у владельца ответили бы на
 * «стоит ли он не у клиента» по-разному, и разошлись бы ровно на людях.
 */
export interface IdleExclusions {
  pins?: readonly CustomerPin[];
  busy?: readonly BusyWindow[];
}

/**
 * Минимум крошек, чтобы утверждать простой.
 *
 * Две точки с разницей в сорок минут — это разрыв связи, а не стояние на
 * месте: между ними человек мог уехать и вернуться. Разрыв ловит `GAP_MS`,
 * но у слабой сети бывают паузы и по четырнадцать минут — они порога не
 * превышают, а доказательством стояния всё равно не служат.
 */
const MIN_PINGS = 4;

/**
 * Окна простоя из трека.
 *
 * Окно — отрезок, внутри которого человек не удалялся дальше `radiusM` от
 * точки входа дольше `minIdleMs`, и всё это время крошки шли.
 *
 * Крошки должны быть отсортированы по времени (это делает `readPingBatch`).
 *
 * @param radiusM  «Рядом» — тот же радиус, что и у стоянок: в плотном
 *                 центре и на окраине это разные числа, и второй такой
 *                 настройки заводить незачем.
 * @param minIdleMs Короче этого — не простой, а светофор и очередь на кассе.
 * @param exclude  Клиенты рядом и уже собранные заезды. Полчаса у шефа —
 *                 это работа, и называть её бездействием нельзя.
 */
export function detectIdle(
  pings: TrackPingInput[],
  radiusM: number,
  minIdleMs: number,
  exclude: IdleExclusions = {},
): IdleWindow[] {
  const pins = exclude.pins ?? [];
  const busy = exclude.busy ?? [];
  const windows: IdleWindow[] = [];
  let anchor: TrackPingInput | null = null;
  let items: TrackPingInput[] = [];

  const flush = () => {
    if (!anchor || items.length < MIN_PINGS) {
      anchor = null;
      items = [];
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const ms = last.at.getTime() - first.at.getTime();
    const atCustomer =
      nearestPin(anchor, pins as CustomerPin[], radiusM) !== null
      || overlapsBusy(first.at, last.at, busy);

    if (ms >= minIdleMs && !atCustomer) {
      windows.push({
        startedAt: first.at,
        endedAt: last.at,
        idleSec: Math.round(ms / 1000),
        latitude: anchor.latitude,
        longitude: anchor.longitude,
        pings: items.length,
      });
    }
    anchor = null;
    items = [];
  };

  for (const ping of pings) {
    if (!anchor) {
      anchor = ping;
      items = [ping];
      continue;
    }

    const gap = ping.at.getTime() - items[items.length - 1].at.getTime();
    if (gap > GAP_MS) {
      // Связь пропадала. Что было в эти минуты, мы не знаем — и окно
      // закрываем тем, что видели, а не тем, что предполагаем.
      flush();
      anchor = ping;
      items = [ping];
      continue;
    }

    // ЯКОРЬ НЕ ДВИГАЕТСЯ вместе с человеком намеренно. Считай мы расстояние
    // до предыдущей крошки, дрожь приёмника на месте (метры туда-сюда)
    // рвала бы сорок минут на десяток коротких окон, а медленный уход
    // шагом — наоборот, тянулся бы простоем через весь квартал.
    if (metersBetween(ping, anchor) > radiusM) {
      flush();
      anchor = ping;
      items = [ping];
      continue;
    }

    items.push(ping);
  }

  flush();
  return windows;
}

/** Пересекается ли окно с временем, когда человек был занят у клиента. */
function overlapsBusy(from: Date, to: Date, busy: readonly BusyWindow[]): boolean {
  // ЛЮБОЕ пересечение, а не «большая часть»: спорный случай решается в
  // пользу сотрудника. Обратное однажды назовёт бездействием разговор с
  // шефом — и доверие к признаку пропадёт целиком.
  return busy.some((b) => b.arrivedAt.getTime() < to.getTime() && from.getTime() < b.leftAt.getTime());
}

/** Сколько всего простоял — для строки «простоев: 3, всего 95 мин». */
export function idleTotalSec(windows: readonly IdleWindow[]): number {
  return windows.reduce((sum, w) => sum + w.idleSec, 0);
}

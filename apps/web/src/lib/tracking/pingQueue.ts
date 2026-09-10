import { metersBetween } from '@/lib/customers/visitProof';

import { MAX_BATCH, type PingSource } from './ping';

// ══════════════════════════════════════════════════════════════════════
// Запись дня браузером: прореживание и очередь.
//
// ЗАЧЕМ ВТОРОЙ СПОСОБ, КОГДА ЕСТЬ TELEGRAM. Трансляция геопозиции —
// основной путь и остаётся им: она одна работает с погашенным экраном.
// Но она требует бота, а бот есть не у всех и не всегда: новый человек не
// начинал диалог, телефон без Telegram, аккаунт заблокирован. Раньше в
// таком случае дня не было вовсе — ни трека, ни километров, ни сверки.
// Теперь есть, пока открыта вкладка.
//
// ЧЕСТНАЯ ГРАНИЦА, КОТОРУЮ НАДО ЗНАТЬ. `watchPosition` живёт, пока
// страница видима. Экран погас или человек ушёл в другое приложение —
// Safari на iPhone замеры замораживает, Chrome на Android сильно
// прореживает. Поэтому запись браузером даёт трек с дырами, и день из
// таких крошек помечается источником `pwa`, а смешанный — `mixed`: там,
// где у трансляции дыра это повод спросить, у браузера это норма.
//
// МОДУЛЬ ЧИСТЫЙ, КАК И `ping.ts`: ни fetch, ни geolocation. Здесь решают
// два вопроса — какую крошку вообще записывать и что делать с накопленным
// без связи. Оба легко сломать молча, поэтому оба проверяются тестами.
// ══════════════════════════════════════════════════════════════════════

/** Крошка в том виде, в каком её принимает `POST /api/admin/tracking/ping`. */
export interface QueuedPing {
  at: number;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  source: PingSource;
  speedMps: number | null;
  headingDeg: number | null;
}

export const PING_QUEUE_KEY = 'mg-ping-queue';

/**
 * Реже этого крошки не пишем.
 *
 * Совпадает с частотой трансляции Telegram намеренно: день, снятый двумя
 * способами, должен считаться одной и той же арифметикой, а не давать
 * разный путь из-за разной плотности точек. Чаще — это заряд и шум: между
 * двумя замерами в десять секунд стоящий человек «проходит» метры дрожи
 * приёмника.
 */
export const MIN_INTERVAL_MS = 45_000;

/**
 * Сместился настолько — пишем, не дожидаясь интервала.
 *
 * Без этого правила машина на проспекте между двумя замерами проезжает
 * километр, и путь считается по хорде через кварталы.
 */
export const MIN_MOVE_M = 25;

/**
 * Хуже этого радиуса замер — не позиция, а догадка по вышке.
 *
 * Порог намеренно мягкий. Строгий отбросил бы весь трек в подвале, где
 * человек и работает; а «точка с радиусом в километр» утащила бы линию
 * через полгорода и выглядела бы уликой.
 */
export const MAX_ACCURACY_M = 200;

/**
 * Потолок очереди.
 *
 * Она наполняется только без связи: при живой сети уходит почти сразу.
 * Тысяча крошек по одной в сорок пять секунд — это больше двенадцати
 * часов без сети, то есть смена целиком.
 */
export const MAX_QUEUE = 1000;

/** Дольше этого не храним: столько же принимает сервер и держат соседи. */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Записывать ли этот замер.
 *
 * `prev` — последняя ПРИНЯТАЯ крошка, а не предыдущий замер: иначе
 * медленное движение отбрасывалось бы шаг за шагом и человек, идущий
 * пешком, оставался бы точкой на месте.
 */
export function shouldKeep(prev: QueuedPing | null, next: QueuedPing): boolean {
  if (next.accuracyM !== null && next.accuracyM > MAX_ACCURACY_M) return false;
  if (!prev) return true;

  const sinceMs = next.at - prev.at;
  // Замер «из прошлого» относительно принятого — сбитые часы или кэш
  // браузера. Порядок трека важнее одной точки.
  if (sinceMs <= 0) return false;
  if (sinceMs >= MIN_INTERVAL_MS) return true;

  return metersBetween(prev, next) >= MIN_MOVE_M;
}

/** Прочитать очередь. Мусор в хранилище — пустая очередь, а не падение. */
export function readQueue(storage: Pick<Storage, 'getItem'>): QueuedPing[] {
  try {
    const raw = storage.getItem(PING_QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPing);
  } catch {
    return [];
  }
}

function isPing(raw: unknown): raw is QueuedPing {
  if (typeof raw !== 'object' || raw === null) return false;
  const p = raw as Record<string, unknown>;
  return (
    typeof p.at === 'number' &&
    typeof p.latitude === 'number' &&
    typeof p.longitude === 'number' &&
    typeof p.source === 'string'
  );
}

/**
 * Записать очередь.
 *
 * `false` — хранилище отказало (приватный режим, переполнение). Это не
 * повод останавливать запись: крошки в памяти хука продолжат уходить,
 * пока есть связь. Молча терять функцию из-за отсутствия хранилища
 * нельзя.
 */
export function writeQueue(
  storage: Pick<Storage, 'setItem'>,
  pings: QueuedPing[],
): boolean {
  try {
    storage.setItem(PING_QUEUE_KEY, JSON.stringify(pings));
    return true;
  } catch {
    return false;
  }
}

/**
 * Добавить крошку к очереди с учётом потолка и срока.
 *
 * ПЕРЕПОЛНЕНИЕ РЕЖЕТ СТАРОЕ, А НЕ НОВОЕ. Свежий хвост отвечает на вопрос
 * «где человек сейчас», ради которого владелец и открыл карту; утренний
 * отрезок к этому моменту почти всегда уже отправлен.
 */
export function enqueue(
  queue: QueuedPing[],
  ping: QueuedPing,
  now: number = Date.now(),
): QueuedPing[] {
  const fresh = queue.filter((p) => now - p.at <= MAX_AGE_MS);
  const next = [...fresh, ping];
  return next.length > MAX_QUEUE ? next.slice(next.length - MAX_QUEUE) : next;
}

/**
 * Сколько крошек отдать за один запрос.
 *
 * Ограничение сервера — `MAX_BATCH`; всё сверх него он молча отрежет, и
 * хвост пачки пропал бы, хотя очередь считала бы его отправленным.
 */
export function takeBatch(queue: QueuedPing[]): QueuedPing[] {
  return queue.slice(0, MAX_BATCH);
}

// ФЛАГ «СМЕНА ПИШЕТСЯ» ОТСЮДА УБРАН, и это намеренно.
//
// Здесь лежала пара `readShift`/`writeShift` — состояние записи в
// `localStorage`. О нём знала только та вкладка, где нажали кнопку:
// человек открывал смену в боте, а приложение продолжало молчать.
//
// Смену открывают из трёх мест, значит правда о ней может быть только
// одна и общая. Теперь она на сервере — `lib/shift/store.ts` и
// `/api/shift`. Оставить копию рядом значило бы завести второй источник
// правды о том же самом.

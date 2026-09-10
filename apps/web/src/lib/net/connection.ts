'use client';

// ══════════════════════════════════════════════════════════════════════
// Какая сейчас связь и как часто её тревожить.
//
// ЗАЧЕМ. Полевые экраны опрашивают сервер минутами: карта клиентов, живой
// слой людей, отчёт дня. На вайфае это незаметно, на двух палках LTE в
// подвале — это очередь запросов, которые не успевают завершиться до
// следующего, забивают единственный канал и мешают уйти тому, ради чего
// человек и достал телефон: отметке визита и фотоотчёту.
//
// ЧТО ДЕЛАЕМ. На слабой связи опрашиваем ВТРОЕ реже, а без связи — не
// опрашиваем вовсе: запрос в никуда стоит времени и заряда, а ответ всё
// равно придёт из кэша. Появится сеть — `online` разбудит очередь и
// запросы сами.
//
// ЧЕГО НЕ ДЕЛАЕМ. Не выключаем ничего насовсем и не прячем данные:
// «медленно» — это про частоту обновления, а не про доступность. Экран,
// который на плохой связи перестаёт работать, бесполезен ровно там, где
// он нужнее всего.
//
// Network Information API есть не везде (в Safari его нет вовсе). Нет —
// считаем связь обычной: гадать в худшую сторону значит замедлить всех
// владельцев iPhone без причины.
// ══════════════════════════════════════════════════════════════════════

interface NetworkInformation {
  effectiveType?: string;
  saveData?: boolean;
}

function connection(): NetworkInformation | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & { connection?: NetworkInformation };
  return nav.connection ?? null;
}

/** Связи нет вовсе. */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Связь слабая: 2G, медленный 2G или включённая экономия трафика.
 *
 * `3g` СЮДА НЕ ВХОДИТ намеренно. По этой шкале «3g» означает задержку
 * порядка 300 мс — обычная городская связь, на которой всё работает.
 * Записать её в слабые значило бы втрое замедлить обновление у половины
 * пользователей без повода.
 */
export function isSlowLink(): boolean {
  const link = connection();
  if (!link) return false;
  if (link.saveData === true) return true;
  return link.effectiveType === '2g' || link.effectiveType === 'slow-2g';
}

/** Во сколько раз реже опрашивать на слабой связи. */
export const SLOW_FACTOR = 3;

/**
 * Интервал опроса под текущую связь.
 *
 * `false` — не опрашивать: так react-query понимает «интервала нет».
 */
export function pollInterval(baseMs: number): number | false {
  if (isOffline()) return false;
  return isSlowLink() ? baseMs * SLOW_FACTOR : baseMs;
}

/**
 * Сколько ждать ответа, прежде чем оборвать запрос.
 *
 * БЕЗ ЭТОГО ЗАПРОС ВИСИТ МИНУТАМИ. На слабой связи соединение не
 * отказывает — оно молчит, и вкладка ждёт его, пока не надоест человеку.
 * Оборванный запрос честнее: react-query повторит его сам, а канал
 * освободится для отметки визита.
 */
export function requestTimeoutMs(baseMs = 15_000): number {
  return isSlowLink() ? baseMs * 2 : baseMs;
}

/** Сигнал отмены по таймауту. `undefined` там, где его не поддержали. */
export function timeoutSignal(baseMs?: number): AbortSignal | undefined {
  if (typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') {
    return undefined;
  }
  return AbortSignal.timeout(requestTimeoutMs(baseMs));
}

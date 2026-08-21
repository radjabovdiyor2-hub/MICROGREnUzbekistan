import { VISIT_NOTE_MAX, isVisitType } from './visits';

// ══════════════════════════════════════════════════════════════════════
// Отметки визитов, сделанные без связи.
//
// Карта уже работает офлайн — точки, адреса и телефоны лежат в снимке. А
// отметить визит было нельзя: запрос падал, и человек, съездивший в подвал
// без сети, терял именно ту запись, ради которой ехал. Плашка честно об
// этом говорила, и теперь говорить больше не о чем.
//
// Очередь на клиенте, а не Background Sync: тот есть в Chrome и нет в
// Safari на iPhone, а терять отметки у половины телефонов ради красивого
// API не стоит. Отправляем сами — при возвращении связи и при открытии
// карты.
// ══════════════════════════════════════════════════════════════════════

export interface QueuedVisit {
  /** Свой идентификатор: id из базы появится только после отправки. */
  key: string;
  customerId: number;
  type: string;
  note: string;
  /** Когда человек нажал кнопку, а не когда запись доехала до сервера. */
  visitedAt: number;
}

export const VISIT_QUEUE_KEY = 'mg-visit-queue';

/**
 * Потолок очереди.
 *
 * День объезда — это до десятка заведений; полсотни с запасом покрывают
 * даже неделю без связи. Дальше растить незачем: очередь живёт в общем
 * localStorage, и раздувать её значит вытеснять чужие данные.
 */
export const MAX_QUEUE = 50;

/**
 * Насколько старую отметку ещё отправляем.
 *
 * Через неделю человек уже не помнит подробностей, а запись всё равно
 * ляжет в журнал задним числом. Молча выбрасывать нельзя — вызывающий
 * скажет, сколько отметок протухло.
 */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface QueueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): QueueStorage | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

/** Ключ отметки: пара «клиент + момент» уникальна в пределах миллисекунды. */
export function visitKey(customerId: number, visitedAt: number): string {
  return `${customerId}:${visitedAt}`;
}

export function readQueue(storage: QueueStorage | null = defaultStorage()): QueuedVisit[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(VISIT_QUEUE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueuedVisit).slice(0, MAX_QUEUE);
  } catch {
    return [];
  }
}

function isQueuedVisit(value: unknown): value is QueuedVisit {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<QueuedVisit>;
  return (
    typeof v.key === 'string' &&
    typeof v.customerId === 'number' &&
    Number.isInteger(v.customerId) &&
    // Тип сверяем со справочником: очередь пролежала в хранилище, а
    // справочник за это время мог измениться — отправлять выведенный тип
    // значит получить 400 и повесить запись в очереди навсегда.
    isVisitType(v.type) &&
    typeof v.note === 'string' &&
    typeof v.visitedAt === 'number' &&
    Number.isFinite(v.visitedAt)
  );
}

export function writeQueue(
  items: QueuedVisit[],
  storage: QueueStorage | null = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(VISIT_QUEUE_KEY, JSON.stringify(items.slice(0, MAX_QUEUE)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Поставить отметку в очередь.
 *
 * Повторное нажатие той же кнопки в ту же миллисекунду — это дребезг, а не
 * второй визит: ключ совпадёт, и запись не удвоится. А вот «не застал», а
 * через час «договорились» — два разных события, и оба обязаны доехать.
 */
export function enqueue(queue: QueuedVisit[], visit: QueuedVisit): QueuedVisit[] {
  if (queue.some((q) => q.key === visit.key)) return queue;
  if (queue.length >= MAX_QUEUE) return queue;
  return [...queue, { ...visit, note: visit.note.slice(0, VISIT_NOTE_MAX) }];
}

export function dequeue(queue: QueuedVisit[], key: string): QueuedVisit[] {
  return queue.filter((q) => q.key !== key);
}

/** Что ещё имеет смысл отправлять, а что протухло. */
export function splitByAge(
  queue: QueuedVisit[],
  now = Date.now(),
): { fresh: QueuedVisit[]; stale: QueuedVisit[] } {
  const fresh: QueuedVisit[] = [];
  const stale: QueuedVisit[] = [];
  for (const item of queue) {
    if (now - item.visitedAt > MAX_AGE_MS) stale.push(item);
    else fresh.push(item);
  }
  return { fresh, stale };
}

// ══════════════════════════════════════════════════════════════════════
// Чеки, пробитые без связи.
//
// Продажа с точки на карте делается там же, где пропадает сеть: во дворе
// ресторана, в подвале, за городом. Без очереди первый же обрыв означал бы
// «Xatolik yuz berdi» на чек, который физически СОСТОЯЛСЯ — товар отдан,
// деньги взяты. Терять после этого запись нельзя ничем.
//
// Устройство то же, что у очереди визитов (lib/customers/visitQueue): свой
// стор в localStorage, отправка вручную при возвращении связи. Отличий два,
// и оба существенные:
//
//   1. У чека есть ключ идемпотентности (`clientKey`). Отметка визита,
//      отправленная дважды, — это две строки в журнале; чек, отправленный
//      дважды, — это второй списанный товар и вторая выручка. Ключ уходит
//      на сервер, и повтор возвращает УЖЕ пробитый чек.
//   2. Срок жизни короче. Отметка недельной давности всё ещё полезна,
//      а продажа недельной давности — это расхождение кассы со складом,
//      которое разбирают руками, а не досылают молча.
// ══════════════════════════════════════════════════════════════════════

/** Позиция чека — ровно в той форме, в какой её принимает /api/inventory/pos. */
export interface QueuedSaleItem {
  productId: string;
  quantity: number;
  price: number;
  priceReason?: string;
}

/** Тело запроса без деловой даты: её подставляет отправщик по возрасту записи. */
export interface QueuedSaleBody {
  items: QueuedSaleItem[];
  paymentMethod: 'cash' | 'card' | 'debt';
  customerId: number | null;
  performedBy: string;
  origin: 'counter' | 'field';
  clientKey: string;
  debtInfo?: { personName: string; phone: string; dueDate: string };
  discount?: { type: 'percent' | 'fixed'; value: number; reason: string };
}

export interface QueuedSale {
  /** Он же `clientKey`: ключ очереди и ключ идемпотентности сервера — один. */
  key: string;
  body: QueuedSaleBody;
  /** Когда нажали «Продать», а не когда чек доехал. */
  soldAt: number;
  /** Подпись для человека: «Плов Центр · 26 000». */
  label: string;
}

export const SALE_QUEUE_KEY = 'mg-sale-queue';

/**
 * Потолок очереди.
 *
 * Двадцать чеков — это полный день разъезда без единой полоски сети. Больше
 * копить незачем: localStorage общий, и раздутая очередь вытесняет чужое.
 */
export const MAX_QUEUE = 20;

/**
 * Насколько старый чек ещё досылаем.
 *
 * Трое суток при пределе продавца в семь (`SELLER_BACKDATE_DAYS`): запас
 * есть, но досылать неделю спустя нельзя — к тому времени по складу уже
 * прошла инвентаризация, и чек задним числом разойдётся с ней. Такое
 * разбирают глазами, а не тихой досылкой.
 */
export const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * С какой задержки чек считается проведённым задним числом.
 *
 * Минута — это про «связь моргнула», и деловая дата от этого не меняется.
 * Проставлять `soldAt` каждому досланному чеку значило бы пометить задним
 * числом даже те, что ушли через две секунды, — и засорить журнал
 * объяснениями там, где объяснять нечего.
 */
export const BACKDATE_AFTER_MS = 60_000;

/**
 * Новый ключ идемпотентности.
 *
 * `randomUUID` есть только в защищённом контексте (https или localhost);
 * запасной путь нужен не ради экзотики, а потому что админку открывают и по
 * локальному IP в сети магазина. Без ключа чек тоже пройдёт — просто
 * потеряет защиту от повтора, и это лучше, чем упасть на его генерации.
 */
export function newClientKey(): string {
  const uuid = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : null;
  if (uuid) return uuid;
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export interface QueueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): QueueStorage | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    // В приватном режиме обращение бросает ещё до чтения.
    return null;
  }
}

function isItem(value: unknown): value is QueuedSaleItem {
  if (typeof value !== 'object' || value === null) return false;
  const i = value as Partial<QueuedSaleItem>;
  return (
    typeof i.productId === 'string' &&
    i.productId.length > 0 &&
    typeof i.quantity === 'number' &&
    Number.isFinite(i.quantity) &&
    i.quantity > 0 &&
    typeof i.price === 'number' &&
    Number.isInteger(i.price) &&
    i.price > 0
  );
}

function isQueuedSale(value: unknown): value is QueuedSale {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Partial<QueuedSale>;
  if (typeof s.key !== 'string' || s.key.length === 0) return false;
  if (typeof s.soldAt !== 'number' || !Number.isFinite(s.soldAt)) return false;
  if (typeof s.label !== 'string') return false;

  const body = s.body as Partial<QueuedSaleBody> | undefined;
  if (!body || !Array.isArray(body.items) || body.items.length === 0) return false;
  if (!body.items.every(isItem)) return false;
  if (body.paymentMethod !== 'cash' && body.paymentMethod !== 'card' && body.paymentMethod !== 'debt') {
    return false;
  }
  if (body.origin !== 'counter' && body.origin !== 'field') return false;
  // Ключ обязан совпадать с ключом очереди: разойдись они — и повторная
  // отправка перестала бы быть идемпотентной, то есть удвоила бы продажу.
  return body.clientKey === s.key;
}

export function readQueue(storage: QueueStorage | null = defaultStorage()): QueuedSale[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(SALE_QUEUE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueuedSale).slice(0, MAX_QUEUE);
  } catch {
    return [];
  }
}

export function writeQueue(
  items: QueuedSale[],
  storage: QueueStorage | null = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SALE_QUEUE_KEY, JSON.stringify(items.slice(0, MAX_QUEUE)));
    return true;
  } catch {
    return false;
  }
}

/** Поставить чек в очередь. Тот же ключ второй раз — тот же чек, а не новый. */
export function enqueue(queue: QueuedSale[], sale: QueuedSale): QueuedSale[] {
  if (queue.some((q) => q.key === sale.key)) return queue;
  if (queue.length >= MAX_QUEUE) return queue;
  return [...queue, sale];
}

export function dequeue(queue: QueuedSale[], key: string): QueuedSale[] {
  return queue.filter((q) => q.key !== key);
}

/** Что ещё имеет смысл досылать, а что разбирают руками. */
export function splitByAge(
  queue: QueuedSale[],
  now = Date.now(),
): { fresh: QueuedSale[]; stale: QueuedSale[] } {
  const fresh: QueuedSale[] = [];
  const stale: QueuedSale[] = [];
  for (const item of queue) {
    if (now - item.soldAt > MAX_AGE_MS) stale.push(item);
    else fresh.push(item);
  }
  return { fresh, stale };
}

/**
 * Тело запроса для отложенного чека.
 *
 * Две поправки против того, что лежало в очереди:
 *
 *   1. Деловая дата и причина — если чек пролежал дольше минуты. Продажа
 *      состоялась тогда, а не в момент, когда вернулась связь; без этого
 *      вечерняя выручка легла бы на следующее утро.
 *   2. Объяснение цены. Сервер отвергает позицию, чья цена разошлась с
 *      прайсом, без причины, — а прайс за время без связи мог поменяться.
 *      Без этой строки честный офлайн-чек получил бы 400 и был бы выброшен
 *      как негодный.
 */
export function toRequestBody(sale: QueuedSale, now = Date.now()): Record<string, unknown> {
  const late = now - sale.soldAt > BACKDATE_AFTER_MS;
  const when = new Date(sale.soldAt);

  return {
    ...sale.body,
    items: sale.body.items.map((i) => ({
      ...i,
      priceReason: i.priceReason || (late ? 'Цена на момент продажи (офлайн)' : undefined),
    })),
    soldAt: late ? when.toISOString() : undefined,
    backdateReason: late
      ? `Продажа из офлайн-очереди (проведена ${when.toLocaleString('ru-RU')})`
      : undefined,
  };
}

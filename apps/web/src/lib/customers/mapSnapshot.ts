import type { MapCollection } from './mapQuery';

// ══════════════════════════════════════════════════════════════════════
// Снимок карты для езды без связи.
//
// Карта нужна ровно там, где связь пропадает: в подвале ресторана, в
// туманах области, между кварталами. Без снимка первый же обрыв показывал
// пустой экран и красную плашку — то есть карта переставала работать в
// тот момент, ради которого её и открыли.
//
// Тайлы подложки кэширует сам браузер, и уже просмотренные улицы
// продолжают рисоваться. Здесь хранятся ТОЧКИ: их отдаёт наш API, а
// service worker `/api/` намеренно не кэширует — ответы админки должны
// быть свежими, и общее правило для них верное. Снимок — исключение под
// присмотром: он живёт в localStorage вкладки, а не в общем кэше, и им
// пользуется только тот, кто уже вошёл в админку.
// ══════════════════════════════════════════════════════════════════════

export const SNAPSHOT_KEY = 'mg-map-snapshot';

/**
 * Потолок снимка.
 *
 * В localStorage около пяти мегабайт на источник, и он общий: раздуть его
 * картой значит сломать соседей — корзину, черновики, выбор навигатора.
 * Тысяча точек весит примерно двести килобайт, так что мегабайта хватает
 * с запасом, а на выборке в десять тысяч снимок просто не пишется. Это
 * честнее, чем выбросить чужие данные ради своих.
 */
export const SNAPSHOT_MAX_BYTES = 1_000_000;

/** Старше суток не показываем: вчерашняя карта хуже честного «нет связи». */
export const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Хранилище передаётся, а не берётся из `window` внутри.
 *
 * На сервере `window` нет вовсе, и обращение к нему уронило бы рендер; в
 * тестах окружение узловое, без DOM. Значение по умолчанию разрешается
 * лениво и отсутствие хранилища считает обычным делом, а не ошибкой.
 */
export interface SnapshotStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): SnapshotStorage | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    // Обращение к localStorage бросает в приватном режиме некоторых
    // браузеров — до чтения дело даже не доходит.
    return null;
  }
}

export interface MapSnapshot {
  collection: MapCollection;
  /** Когда снят, миллисекунды эпохи. */
  at: number;
  /** Ключ запроса: снимок с одними фильтрами не годится для других. */
  key: string;
}

/**
 * Сохранить снимок. Молча ничего не делает, если не влезает.
 *
 * Отказ хранилища — не повод показывать человеку ошибку: он открыл карту,
 * а не хранилище, и «не удалось сохранить снимок» ему сказать нечего.
 * Приватный режим и переполненная квота ведут себя одинаково.
 */
export function saveSnapshot(
  collection: MapCollection,
  key: string,
  at = Date.now(),
  storage: SnapshotStorage | null = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    const payload = JSON.stringify({ collection, at, key } satisfies MapSnapshot);
    if (payload.length > SNAPSHOT_MAX_BYTES) return false;
    storage.setItem(SNAPSHOT_KEY, payload);
    return true;
  } catch {
    return false;
  }
}

/**
 * Прочитать снимок под те же фильтры.
 *
 * Чужой ключ отбрасывается: показать под фильтром «тойхоны Ургута» точки,
 * снятые по всей области, значит соврать — человек решит, что тойхон там
 * сотня. Просроченный — тоже: вчерашняя карта выглядит рабочей, и по ней
 * поедут.
 */
export function readSnapshot(
  key: string,
  now = Date.now(),
  storage: SnapshotStorage | null = defaultStorage(),
): MapSnapshot | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const snap = parsed as Partial<MapSnapshot>;
    if (snap.key !== key) return null;
    if (typeof snap.at !== 'number' || !Number.isFinite(snap.at)) return null;
    if (now - snap.at > SNAPSHOT_MAX_AGE_MS) return null;
    if (!snap.collection || !Array.isArray(snap.collection.features)) return null;

    return { collection: snap.collection, at: snap.at, key };
  } catch {
    return null;
  }
}

/** Часы и минуты снимка — то, что читает человек на плашке. */
export function snapshotTime(at: number, now = Date.now()): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин. назад`;

  const time = new Date(at);
  const hh = String(time.getHours()).padStart(2, '0');
  const mm = String(time.getMinutes()).padStart(2, '0');
  return `в ${hh}:${mm}`;
}

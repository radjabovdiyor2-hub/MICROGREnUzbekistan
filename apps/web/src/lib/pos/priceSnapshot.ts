import type { ContractPrice, Product } from '@/components/admin/AdminPOSTypes';

// ══════════════════════════════════════════════════════════════════════
// Снимок прайса для продажи без связи.
//
// Очередь чеков (saleQueue) спасает УЖЕ набранный чек. Но набрать его тоже
// нечем: сетка товаров приходит из `/api/products`, а service worker
// намеренно не кэширует `/api/` — ответы админки должны быть свежими.
// В подвале ресторана касса открывалась пустой, и «продать без связи»
// оставалось лозунгом.
//
// Снимок — то же исключение под присмотром, что и снимок карты
// (lib/customers/mapSnapshot): он живёт в localStorage вкладки, а не в
// общем кэше, и им пользуется только тот, кто уже вошёл в админку.
//
// Договорные цены клиента лежат здесь же: продать ресторану по прайсу,
// потому что «цены не доехали», — это ровно та ошибка, ради устранения
// которой договорные цены и заводились.
// ══════════════════════════════════════════════════════════════════════

export const PRICE_SNAPSHOT_KEY = 'mg-pos-price-snapshot';

/** Потолок снимка: localStorage общий, раздувать его нельзя. */
export const PRICE_SNAPSHOT_MAX_BYTES = 600_000;

/** Старше суток не показываем: вчерашний прайс хуже честного «нет связи». */
export const PRICE_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface PriceSnapshot {
  products: Product[];
  /** Договорные цены по клиенту: id клиента → (id товара → цена). */
  contracts: Record<string, [string, ContractPrice][]>;
  at: number;
}

export interface SnapshotStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): SnapshotStorage | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    // В приватном режиме обращение бросает ещё до чтения.
    return null;
  }
}

function readRaw(storage: SnapshotStorage | null): PriceSnapshot | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PRICE_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const snap = parsed as Partial<PriceSnapshot>;
    if (typeof snap.at !== 'number' || !Number.isFinite(snap.at)) return null;
    if (!Array.isArray(snap.products)) return null;
    return {
      products: snap.products,
      contracts: typeof snap.contracts === 'object' && snap.contracts !== null ? snap.contracts : {},
      at: snap.at,
    };
  } catch {
    return null;
  }
}

/**
 * Запомнить прайс. Молча ничего не делает, если не влезает.
 *
 * Отказ хранилища — не повод показывать ошибку: человек открыл кассу, а не
 * хранилище. Приватный режим и переполненная квота ведут себя одинаково.
 */
export function savePriceSnapshot(
  products: Product[],
  at = Date.now(),
  storage: SnapshotStorage | null = defaultStorage(),
): boolean {
  if (!storage || products.length === 0) return false;
  try {
    // Договорные цены из прошлого снимка сохраняем: прайс обновляется чаще,
    // а терять цены клиента при каждом обновлении сетки товаров незачем.
    const previous = readRaw(storage);
    const payload = JSON.stringify({
      products,
      contracts: previous?.contracts ?? {},
      at,
    } satisfies PriceSnapshot);
    if (payload.length > PRICE_SNAPSHOT_MAX_BYTES) return false;
    storage.setItem(PRICE_SNAPSHOT_KEY, payload);
    return true;
  } catch {
    return false;
  }
}

/** Запомнить договорные цены клиента рядом с прайсом. */
export function saveContractSnapshot(
  customerId: number,
  prices: Map<string, ContractPrice>,
  storage: SnapshotStorage | null = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    const previous = readRaw(storage);
    if (!previous) return false;
    const payload = JSON.stringify({
      ...previous,
      contracts: { ...previous.contracts, [String(customerId)]: [...prices.entries()] },
    } satisfies PriceSnapshot);
    if (payload.length > PRICE_SNAPSHOT_MAX_BYTES) return false;
    storage.setItem(PRICE_SNAPSHOT_KEY, payload);
    return true;
  } catch {
    return false;
  }
}

/** Прайс из снимка. `null` — снимка нет или он протух. */
export function readPriceSnapshot(
  now = Date.now(),
  storage: SnapshotStorage | null = defaultStorage(),
): { products: Product[]; at: number } | null {
  const snap = readRaw(storage);
  if (!snap) return null;
  if (now - snap.at > PRICE_SNAPSHOT_MAX_AGE_MS) return null;
  return { products: snap.products, at: snap.at };
}

/** Договорные цены клиента из снимка. Пустая карта — их там нет. */
export function readContractSnapshot(
  customerId: number,
  now = Date.now(),
  storage: SnapshotStorage | null = defaultStorage(),
): Map<string, ContractPrice> {
  const snap = readRaw(storage);
  if (!snap) return new Map();
  if (now - snap.at > PRICE_SNAPSHOT_MAX_AGE_MS) return new Map();
  return new Map(snap.contracts[String(customerId)] ?? []);
}

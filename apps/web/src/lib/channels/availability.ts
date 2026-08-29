import { channelDef } from './registry';
import { taxonomyFor } from './taxonomy';

// ══════════════════════════════════════════════════════════════════════
// Что канал имеет право показать и по какой цене.
//
// Один расчёт на все выдачи наружу — фиды, стоп-листы, выгрузки. Если бы
// каждая считала сама, они разошлись бы в первый же вечер: Merchant
// показывал бы лоток, которого нет, а стоп-лист агрегатора уже снял его.
//
// Правило свежего товара простое: молчаливое «наверное, ещё есть» — это
// отмена заказа со штрафом и минус к рейтингу магазина. Поэтому любая
// неуверенность разрешается в пользу «нет в наличии».
// ══════════════════════════════════════════════════════════════════════

/** Настройки канала из `sales_channels` — то, что правит владелец. */
export interface ChannelPolicy {
  code: string;
  isActive: boolean;
  cities: string[];
  stockBuffer: number;
  markupPercent: number;
  /** `HH:MM` по Asia/Samarkand или null. */
  orderCutoff: string | null;
  lastSyncAt: Date | null;
}

/** Товар в том виде, в каком его читают фиды. */
export interface ChannelProduct {
  id: string;
  price: number;
  /** Остаток в единицах товара. Дробный `Decimal` приводит вызывающий. */
  stock: number;
  categorySlug: string | null;
  isActive: boolean;
}

export type Availability =
  | { available: true; quantity: number; price: number }
  | { available: false; reason: string };

/** Сколько часов без успешной синхронизации делают остаток недостоверным. */
const STALE_HOURS = 1;

/**
 * Цена канала: цена витрины плюс наценка, вверх до сотни сумов.
 *
 * Наценка покрывает комиссию площадки. Округление вверх, а не
 * математическое: округление вниз отдаёт площадке нашу маржу.
 *
 * ⚠️ Умножаем на `(100 + наценка)` и делим на 100, а НЕ на `1 + n/100`.
 * Второе — плавающая точка: `25 000 × 1.1` даёт 27500.000000000004, и
 * округление вверх до сотни превращало ровные 27 500 в 27 600. Ошибка
 * ровно в сто сумов на позицию, всегда в одну сторону, и в тесте с
 * другими числами её не видно — нашлась живым прогоном.
 */
export function channelPrice(price: number, markupPercent: number): number {
  const raised = Math.round((price * (100 + markupPercent)) / 100);
  return Math.ceil(raised / 100) * 100;
}

/** Остаток наружу: целые единицы за вычетом буфера, не меньше нуля. */
export function channelStock(stock: number, buffer: number): number {
  return Math.max(0, Math.floor(stock) - Math.max(0, buffer));
}

/**
 * Местное время в минутах от полуночи.
 *
 * Через `Intl`, а не сдвигом на пять часов руками: сервер может стоять в
 * любом поясе, и «+5» верно ровно до первого переезда контейнера.
 */
function samarkandMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Samarkand',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

/** Разобрать `HH:MM` в минуты. Мусор = отсечки нет, а не полночь. */
function cutoffMinutes(cutoff: string | null): number | null {
  if (!cutoff) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(cutoff.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** Прошло ли окно отгрузки на сегодня. */
export function isPastCutoff(policy: ChannelPolicy, now: Date = new Date()): boolean {
  const limit = cutoffMinutes(policy.orderCutoff);
  if (limit === null) return false;
  return samarkandMinutes(now) >= limit;
}

/**
 * Давно ли канал не синхронизировался.
 *
 * Считается только для каналов, которым остатки шлём МЫ: у фидовых
 * площадка забирает сама, и «давно не синхронизировались» там означало бы
 * лишь то, что робот Google не заходил — прятать от него товар незачем.
 */
export function isStale(policy: ChannelPolicy, now: Date = new Date()): boolean {
  const def = channelDef(policy.code);
  if (!def || def.syncMode !== 'api') return false;
  if (!policy.lastSyncAt) return false;
  return now.getTime() - policy.lastSyncAt.getTime() > STALE_HOURS * 60 * 60 * 1000;
}

/**
 * Можно ли отдать товар в этот канал прямо сейчас.
 *
 * Порядок проверок — от общего к частному, чтобы причина отказа была
 * самой верхней: владельцу на экране «Каналы» важно «канал выключен», а
 * не «после отсечки» у выключенного канала.
 */
export function availabilityFor(
  product: ChannelProduct,
  policy: ChannelPolicy,
  now: Date = new Date(),
): Availability {
  const def = channelDef(policy.code);
  if (!def) return { available: false, reason: 'Канал не описан в реестре' };
  if (!policy.isActive) return { available: false, reason: 'Канал выключен' };
  if (!product.isActive) return { available: false, reason: 'Товар снят с витрины' };

  const { perishable } = taxonomyFor(product.categorySlug);

  if (perishable) {
    if (!def.allowsPerishable) {
      return { available: false, reason: 'Скоропорт не выставляется на этой площадке' };
    }
    if (policy.cities.length === 0) {
      return { available: false, reason: 'У канала не задан город доставки в пределах суток' };
    }
    if (isPastCutoff(policy, now)) {
      return { available: false, reason: 'Прошло окно отгрузки — до утра' };
    }
    if (isStale(policy, now)) {
      return { available: false, reason: 'Канал не синхронизировался больше часа' };
    }
  }

  const quantity = channelStock(product.stock, policy.stockBuffer);
  if (quantity <= 0) return { available: false, reason: 'Нет остатка сверх буфера' };

  return { available: true, quantity, price: channelPrice(product.price, policy.markupPercent) };
}

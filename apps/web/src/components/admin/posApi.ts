import type { CartDiscount, CartItem, ContractPrice, DebtInfo, SaleDate } from './AdminPOSTypes';

// Обращения кассы к /api/inventory/pos. Вынесено из AdminPOS: файл перерос
// 200 строк. Здесь только запрос и разбор ответа — что делать с результатом,
// решает компонент.

const toPayloadItems = (cart: CartItem[]) => cart.map(item => ({
  productId: item.product.id,
  quantity: item.quantity,
  price: item.customPrice,
  // Причина уходит только вместе с изменённой ценой: сервер требует её
  // именно в этом случае и игнорирует в остальных.
  priceReason: item.customPrice === item.product.price ? undefined : item.priceReason,
}));

/**
 * Дата продажи в ISO — или `undefined` для обычного чека.
 *
 * К выбранному дню добавляем текущее время: `<input type="date">` даёт голую
 * дату, а голая дата — это полночь. Продажа, проведённая за вчера, вставала
 * бы ровно в 00:00 и в отчёте смены выглядела бы ночной.
 */
function toSoldAt(saleDate: SaleDate | null): string | undefined {
  if (!saleDate?.date) return undefined;
  const now = new Date();
  const at = new Date(`${saleDate.date}T00:00:00`);
  at.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
  return at.toISOString();
}

export interface PosResponse {
  success?: boolean;
  error?: string;
  saleNumber?: string;
  returnNumber?: string;
  total?: number;
  totalRefund?: number;
  /** Сумма до скидки на чек. */
  gross?: number;
  /** Фактическая скидка — она может отличаться от запрошенной на сумы. */
  discount?: number;
  backdated?: boolean;
  soldAt?: string;
  /** Сервер узнал чек по `clientKey` и вернул уже пробитый, а не создал второй. */
  duplicate?: boolean;
}

export interface SaleExtras {
  discount: CartDiscount | null;
  saleDate: SaleDate | null;
  /** Кого владелец указал автором чека. У продавца не читается. */
  seller: string;
  /** Покупатель — ради договорной цены и истории продаж по клиенту. */
  customerId: number | null;
  /** Где продали: за прилавком или с выезда по карте. */
  origin: 'counter' | 'field';
  /**
   * Ключ идемпотентности. Один на попытку продажи и НЕ меняется при повторе:
   * по нему сервер отличает «тот же чек» от «второго чека».
   */
  clientKey: string;
}

/**
 * Договорные цены покупателя: id товара → цена.
 *
 * Тянутся один раз при выборе покупателя, а не при каждом добавлении товара:
 * иначе сервер дёргался бы на каждое нажатие.
 *
 * `null` — цены НЕ доехали, и это не то же самое, что «их нет»: пустая
 * карта означала бы «продавать по прайсу», а на самом деле у ресторана
 * договорная цена есть и просто не загрузилась. Вызывающий по `null`
 * достаёт цены из офлайн-снимка.
 */
export async function fetchContractPrices(
  customerId: number,
): Promise<Map<string, ContractPrice> | null> {
  try {
    const res = await fetch(`/api/inventory/customers/prices?customerId=${customerId}`, {
      credentials: 'same-origin',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return new Map(
      (data.prices ?? []).map((p: { productId: string; price: number; note: string | null }) =>
        [p.productId, { price: p.price, note: p.note }] as const),
    );
  } catch {
    return null;
  }
}

export async function submitSale(
  cart: CartItem[],
  paymentMethod: 'cash' | 'card' | 'debt',
  performedBy: string,
  debtInfo: DebtInfo,
  extras: SaleExtras,
): Promise<PosResponse> {
  const soldAt = toSoldAt(extras.saleDate);
  const discountValue = Number(extras.discount?.value ?? 0);

  const res = await fetch('/api/inventory/pos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: toPayloadItems(cart),
      paymentMethod,
      customerId: extras.customerId,
      origin: extras.origin,
      clientKey: extras.clientKey,
      // Автора чека сервер берёт из сессии и принимает из тела только у
      // владельца — здесь это режим «владелец заносит за продавца».
      performedBy: extras.seller.trim() || performedBy,
      debtInfo: paymentMethod === 'debt' ? debtInfo : undefined,
      soldAt,
      backdateReason: soldAt ? extras.saleDate?.reason : undefined,
      discount: extras.discount && discountValue > 0
        ? { type: extras.discount.type, value: discountValue, reason: extras.discount.reason }
        : undefined,
    }),
  });
  return res.json();
}

export async function submitReturn(
  cart: CartItem[],
  reason: string,
  performedBy: string,
  // Номер исходной продажи обязателен: по нему сервер проверяет, что
  // возвращают не больше проданного и не повторно. Без него возврат
  // ничем не ограничивался — один запрос дважды прибавлял товар на склад.
  saleNumber: string,
): Promise<PosResponse> {
  const res = await fetch('/api/inventory/pos', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: toPayloadItems(cart), reason, performedBy, saleNumber }),
  });
  return res.json();
}

/** Позиции с изменённой ценой, но без объяснения — сервер их не примет. */
export function missingPriceReasons(cart: CartItem[]): string[] {
  return cart
    .filter(item => item.customPrice !== item.product.price && !item.priceReason?.trim())
    .map(item => item.product.nameUz);
}

/** Продажа ниже себестоимости: список предупреждений для подтверждения. */
export function belowCostWarnings(cart: CartItem[], fmt: (n: number) => string): string[] {
  return cart
    .filter(item => item.product.costPrice && item.customPrice < item.product.costPrice)
    .map(item => `⚠️ ${item.product.nameUz}: ${fmt(item.customPrice)} < tan narxi ${fmt(item.product.costPrice!)}`);
}

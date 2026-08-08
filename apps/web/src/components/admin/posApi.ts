import type { CartItem, DebtInfo } from './AdminPOSTypes';

// Обращения кассы к /api/inventory/pos. Вынесено из AdminPOS: файл перерос
// 200 строк. Здесь только запрос и разбор ответа — что делать с результатом,
// решает компонент.

const toPayloadItems = (cart: CartItem[]) => cart.map(item => ({
  productId: item.product.id,
  quantity: item.quantity,
  price: item.customPrice,
}));

export interface PosResponse {
  success?: boolean;
  error?: string;
  saleNumber?: string;
  returnNumber?: string;
  total?: number;
  totalRefund?: number;
}

export async function submitSale(
  cart: CartItem[],
  paymentMethod: 'cash' | 'card' | 'debt',
  performedBy: string,
  debtInfo: DebtInfo,
): Promise<PosResponse> {
  const res = await fetch('/api/inventory/pos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: toPayloadItems(cart),
      paymentMethod,
      performedBy,
      debtInfo: paymentMethod === 'debt' ? debtInfo : undefined,
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

/** Продажа ниже себестоимости: список предупреждений для подтверждения. */
export function belowCostWarnings(cart: CartItem[], fmt: (n: number) => string): string[] {
  return cart
    .filter(item => item.product.costPrice && item.customPrice < item.product.costPrice)
    .map(item => `⚠️ ${item.product.nameUz}: ${fmt(item.customPrice)} < tan narxi ${fmt(item.product.costPrice!)}`);
}

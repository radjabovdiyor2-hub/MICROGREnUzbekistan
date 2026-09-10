'use client';

// E-commerce event tracking — safe no-op wrappers around GA4 (gtag) and
// Yandex Metrika (ym). Counters are injected by <Analytics/> only when the
// env IDs are set, so every call here must tolerate their absence.

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    ym?: (id: number, method: string, ...args: unknown[]) => void;
    __ymId?: number;
  }
}

function ga(event: string, params: Record<string, unknown>) {
  try { window.gtag?.('event', event, params); } catch { /* noop */ }
}

function ymGoal(goal: string, params?: Record<string, unknown>) {
  try {
    if (window.ym && window.__ymId) window.ym(window.__ymId, 'reachGoal', goal, params);
  } catch { /* noop */ }
}

export interface TrackItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

/**
 * Переход к товару — нажатие на карточку в любом списке.
 *
 * ЭТОГО СОБЫТИЯ НЕ БЫЛО ВОВСЕ. Воронка начиналась с `add_to_cart`, то
 * есть первый шаг — «человек заинтересовался товаром» — не считался
 * нигде. Из-за этого нельзя было ответить на вопрос, ради которого
 * витрину и переделывают: приводит ли новый блок людей к товарам или
 * просто занимает экран.
 *
 * `list` говорит, ОТКУДА пришли: главная, каталог, рецепт. Без него все
 * переходы сольются в одно число, и сравнить блоки будет нечем.
 */
export function trackSelectItem(item: Omit<TrackItem, 'quantity'>, list: string) {
  ga('select_item', {
    item_list_name: list,
    items: [{ item_id: item.id, item_name: item.name, price: item.price }],
  });
  ymGoal('select_item', { product: item.name, list });
}

/**
 * Заявка от заведения — успешно отправленная форма на /b2b.
 *
 * Вторая метрика, которой не было. Заявки уходили в Telegram и в офис, но
 * счётчики о них не знали: сравнить «сколько зашло на страницу» и
 * «сколько написало» было невозможно.
 *
 * Зовётся ТОЛЬКО после ответа сервера. Событие на нажатие кнопки считало
 * бы и те заявки, которые не дошли, — и показывало бы рост там, где на
 * самом деле отказ сети.
 */
export function trackLead(source: string) {
  ga('generate_lead', { currency: 'UZS', source });
  ymGoal('generate_lead', { source });
}

export function trackAddToCart(item: TrackItem) {
  ga('add_to_cart', {
    currency: 'UZS',
    value: item.price * item.quantity,
    items: [{ item_id: item.id, item_name: item.name, price: item.price, quantity: item.quantity }],
  });
  ymGoal('add_to_cart', { product: item.name });
}

export function trackBeginCheckout(value: number, items: TrackItem[]) {
  ga('begin_checkout', {
    currency: 'UZS',
    value,
    items: items.map(i => ({ item_id: i.id, item_name: i.name, price: i.price, quantity: i.quantity })),
  });
  ymGoal('begin_checkout', { value });
}

export function trackPurchase(orderNumber: string, value: number, items: TrackItem[]) {
  ga('purchase', {
    transaction_id: orderNumber,
    currency: 'UZS',
    value,
    items: items.map(i => ({ item_id: i.id, item_name: i.name, price: i.price, quantity: i.quantity })),
  });
  ymGoal('purchase', { order_id: orderNumber, value });
}

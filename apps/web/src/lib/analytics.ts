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

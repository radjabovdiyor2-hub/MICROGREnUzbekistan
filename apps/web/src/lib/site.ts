// ==========================================
// Microgreen Uzbekistan — single source of truth for
// delivery economics and contacts. Import this instead of
// hardcoding thresholds/phones (they used to drift across files).
// Safe to import from both server routes and client components.
// ==========================================

export const DELIVERY = {
  /** Free delivery from this subtotal (so'm) */
  freeThreshold: 500_000,
  /** Flat delivery fee below the threshold (so'm) */
  fee: 25_000,
} as const;

/** Delivery fee for a given subtotal — the ONE place that decides it. */
export function deliveryFeeFor(subtotal: number): number {
  return subtotal >= DELIVERY.freeThreshold ? 0 : DELIVERY.fee;
}

/** How much more to spend to unlock free delivery (0 once reached). */
export function freeDeliveryRemaining(subtotal: number): number {
  return Math.max(0, DELIVERY.freeThreshold - subtotal);
}

/**
 * Срок «под заказ» в днях — что обещаем, когда остатка нет.
 *
 * Микрозелень растят под заказ, и заказ сверх остатка приём уже принимает
 * (см. lib/orders/afterCreate.ts). Число — типовой цикл микрозелени от посева
 * до среза; оно попадает покупателю на глаза, поэтому живёт здесь, рядом с
 * порогом доставки, а не строкой в компоненте.
 */
export const GROW_TO_ORDER_DAYS = 7;

export const CONTACT = {
  phonePrimary: "+998 94 999 95 99",
  phonePrimaryHref: "tel:+998949999599",
  phoneSecondary: "+998 98 007 20 20",
  phoneSecondaryHref: "tel:+998980072020",
  // Social — single source of truth (keep handles consistent everywhere).
  instagram: "microgreenuzbekistan",
  instagramUrl: "https://www.instagram.com/microgreenuzbekistan",
  telegramChannel: "Microgreen_Uzbekistan",
  telegramChannelUrl: "https://t.me/Microgreen_Uzbekistan",
  telegramBot: "Microgreenuzbekistan_bot",
  telegramBotUrl: "https://t.me/Microgreenuzbekistan_bot",
  whatsapp: "998949999599",
  whatsappUrl: "https://wa.me/998949999599",
} as const;

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

export const CONTACT = {
  phonePrimary: "+998 94 999 95 99",
  phonePrimaryHref: "tel:+998949999599",
  phoneSecondary: "+998 98 007 20 20",
  phoneSecondaryHref: "tel:+998980072020",
  instagram: "microgreenuzbekistan",
} as const;

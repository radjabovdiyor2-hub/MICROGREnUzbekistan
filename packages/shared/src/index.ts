// ==========================================
// MAHALU — Shared Constants
// ==========================================

export const BRAND = {
  name: 'Mahalu',
  slogan: {
    uz: 'Uyingiz uchun kerakli hamma narsa',
    ru: 'Всё что нужно для вашего дома',
  },
  phone: '+998997772232',
  instagram: 'mahalu_uz',
  location: {
    address: {
      uz: 'Ray senter, Hokimiyat yonida',
      ru: 'Райцентр, рядом с Хокимиятом',
    },
    lat: 39.6518,
    lng: 66.9597,
  },
} as const;

export const DELIVERY = {
  freeThreshold: 500000, // Бесплатная доставка от 500К сум
  fee: 25000,            // Стоимость доставки
  estimatedMinutes: {
    min: 30,
    max: 90,
  },
} as const;

export const CURRENCIES = {
  UZS: {
    code: 'UZS',
    symbol: "so'm",
    locale: 'uz-UZ',
  },
} as const;

export const ORDER_STATUSES = {
  PENDING: { uz: 'Kutilmoqda', ru: 'Ожидает', color: '#F59E0B', icon: '⏳' },
  CONFIRMED: { uz: 'Tasdiqlandi', ru: 'Подтверждён', color: '#3B82F6', icon: '✅' },
  PREPARING: { uz: 'Tayyorlanmoqda', ru: 'Собирается', color: '#8B5CF6', icon: '📦' },
  DELIVERING: { uz: 'Yetkazilmoqda', ru: 'Доставляется', color: '#2D5BFF', icon: '🚚' },
  DELIVERED: { uz: 'Yetkazildi', ru: 'Доставлен', color: '#10B981', icon: '🎉' },
  CANCELLED: { uz: 'Bekor qilindi', ru: 'Отменён', color: '#EF4444', icon: '❌' },
} as const;

export const PAYMENT_METHODS = {
  cash: { uz: 'Naqd pul', ru: 'Наличные', icon: '💵' },
  click: { uz: 'Click', ru: 'Click', icon: '📱' },
  payme: { uz: 'Payme', ru: 'Payme', icon: '💳' },
} as const;

/** Format price with proper Uzbek thousands separator */
export function formatPrice(price: number): string {
  return price.toLocaleString('ru-RU').replace(/,/g, ' ');
}

/** Calculate discount percentage */
export function getDiscountPercent(price: number, oldPrice: number): number {
  if (!oldPrice || oldPrice <= price) return 0;
  return Math.round(((oldPrice - price) / oldPrice) * 100);
}

/** Generate order number: M-YYYYMMDD-XXXX */
export function generateOrderNumber(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `M-${date}-${rand}`;
}

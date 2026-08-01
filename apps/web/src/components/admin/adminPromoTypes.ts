// Форма промокода. Вынесена из AdminPromo.

export interface Promo {
  id: string; code: string; discountType: 'percent' | 'fixed'; value: number;
  minSubtotal: number; maxUses: number | null; usedCount: number;
  isActive: boolean; expiresAt: string | null; createdAt: string;
  exhausted: boolean; expired: boolean;
}

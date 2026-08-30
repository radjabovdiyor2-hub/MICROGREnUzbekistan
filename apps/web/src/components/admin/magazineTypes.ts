import type { CSSProperties } from 'react';

/** Ресторан-владелец журнала — из /api/admin/magazine/restaurants. */
export interface MagazineRestaurant {
  id: string;
  slug: string;
}

/** Блюдо с видео-кадром — из /api/admin/magazine/dishes. */
export interface MagazineDish {
  id: string;
  code: number;
  nameRu: string;
  videoUrl?: string | null;
  restaurantId?: string;
}

export const qrBtn: CSSProperties = {
  padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border-color)',
  background: 'transparent', cursor: 'pointer', fontSize: 'var(--text-sm)', fontWeight: 600,
};

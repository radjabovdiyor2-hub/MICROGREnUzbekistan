// ════════════════════════════════════════════════════════════
// Загрузка меню и кадров гостей для публичных роутов /m/[slug] (server-only).
// ════════════════════════════════════════════════════════════
import { prisma } from '@repo/database';

export interface MenuRestaurant {
  id: string;
  slug: string;
  name: string;
  city: string;
  logo: string | null;
  instagram: string | null;
  brandPrimary: string | null;
  brandAccent: string | null;
  promoCode: string | null;
  promoDiscount: number | null;
}

export async function loadRestaurantBySlug(slug: string): Promise<MenuRestaurant | null> {
  const r = await prisma.restaurant.findUnique({ where: { slug } });
  if (!r) return null;
  return {
    id: r.id,
    slug: r.slug ?? r.id,
    name: r.name,
    city: r.city,
    logo: r.logo,
    instagram: r.instagram,
    brandPrimary: r.brandPrimary,
    brandAccent: r.brandAccent,
    promoCode: r.promoCode,
    promoDiscount: r.promoDiscount,
  };
}

export async function loadMenu(restaurantId: string) {
  return prisma.dish.findMany({
    where: { restaurantId, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  });
}

export async function loadDishByCode(restaurantId: string, code: number) {
  if (!Number.isFinite(code)) return null;
  return prisma.dish.findUnique({
    where: { restaurantId_code: { restaurantId, code } },
  });
}

/** Одобренные кадры для витрины — лента, из которой ресторан берёт контент. */
export async function loadApprovedPhotos(restaurantId: string, take = 24) {
  return prisma.guestPhoto.findMany({
    where: { restaurantId, status: { in: ['approved', 'printed'] } },
    orderBy: { createdAt: 'desc' },
    take,
  });
}

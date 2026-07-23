import { notFound } from 'next/navigation';
import { loadRestaurantBySlug, loadDishByCode } from '@/lib/magazine/restaurantMenu';
import { formatPrice } from '@/lib/magazine/menu';
import { FrameStudio } from '@/components/menu/FrameStudio';

// Камера. AppShell отдаёт этот роут без хрома сайта — иначе анимация
// page-enter оставляет на main transform и полноэкранный оверлей схлопывается.
export const dynamic = 'force-dynamic';

export default async function FramePage({ params }: { params: Promise<{ slug: string; code: string }> }) {
  const { slug, code } = await params;
  const restaurant = await loadRestaurantBySlug(slug);
  if (!restaurant) notFound();

  const dish = await loadDishByCode(restaurant.id, Number(code));
  if (!dish) notFound();

  return (
    <FrameStudio
      slug={slug}
      dishCode={dish.code}
      brand={{
        name: restaurant.name,
        logo: restaurant.logo,
        instagram: restaurant.instagram,
        brandPrimary: restaurant.brandPrimary,
        brandAccent: restaurant.brandAccent,
        promoCode: restaurant.promoCode,
        promoDiscount: restaurant.promoDiscount,
      }}
      content={{
        dishName: dish.nameRu,
        dishNameUz: dish.nameUz,
        price: formatPrice(dish.price),
      }}
    />
  );
}

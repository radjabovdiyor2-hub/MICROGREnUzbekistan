import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata, Viewport } from 'next';
import { loadRestaurantBySlug, loadDishByCode, loadMenu } from '@/lib/magazine/restaurantMenu';
import { MenuTracker } from '@/components/menu/MenuTracker';
import { DishVideo } from '@/components/menu/DishVideo';
import { DishOverlayCard } from './DishOverlayCard';

// Страница блюда — Apple-стиль просмотр по QR-коду.
export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  themeColor: 'rgb(var(--overlay-dark-rgb))',
};

// Apple-style constants
const FONT = "-apple-system, 'SF Pro Text', 'SF Pro Display', 'Inter', 'Helvetica Neue', sans-serif";
const VIBRANCY = 'var(--surface-vibrancy)';
const VIBRANCY_BORDER = 'rgba(var(--overlay-light-rgb), 0.18)';
const BLUR = 'saturate(180%) blur(20px)';

export async function generateMetadata({ params }: { params: Promise<{ slug: string; code: string }> }): Promise<Metadata> {
  const { slug, code } = await params;
  const r = await loadRestaurantBySlug(slug);
  if (!r) return { title: 'Блюдо' };
  const dish = await loadDishByCode(r.id, Number(code));
  return {
    title: dish ? `${dish.nameRu} — ${r.name}` : r.name,
  };
}

export default async function DishPage({ params }: { params: Promise<{ slug: string; code: string }> }) {
  const { slug, code } = await params;
  const restaurant = await loadRestaurantBySlug(slug);
  if (!restaurant) notFound();

  const dish = await loadDishByCode(restaurant.id, Number(code));
  if (!dish) notFound();

  const menu = await loadMenu(restaurant.id);
  const pair = dish.pairsWith
    ? menu.find((d) => d.nameRu.toLowerCase() === dish.pairsWith!.toLowerCase())
    : undefined;

  const accent = restaurant.brandPrimary || 'var(--info)';

  return (
    <div style={{
      width: '100vw',
      height: '100dvh',
      background: 'rgb(var(--overlay-dark-rgb))',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <MenuTracker slug={slug} dishId={dish.id} />

      {/* Fullscreen media background */}
      <DishVideo
        videoUrl={dish.videoUrl}
        videoPoster={dish.videoPoster}
        photo={dish.photo}
        alt={dish.nameRu}
        fullScreen={true}
      />

      {/* Back button — Apple-style vibrancy pill */}
      <div style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 16px) + 12px)',
        left: 16,
        zIndex: 30,
        animation: 'reels-fade-in 0.6s cubic-bezier(0.25, 0.1, 0.25, 1) 0.3s both',
      }}>
        <Link href={`/m/${slug}`} style={{
          fontFamily: FONT,
          fontSize: 15,
          fontWeight: 400,
          letterSpacing: -0.24,
          color: 'var(--text-inverse)',
          textDecoration: 'none',
          background: VIBRANCY,
          backdropFilter: BLUR,
          WebkitBackdropFilter: BLUR,
          padding: '7px 14px 7px 10px',
          borderRadius: 20,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 2,
          border: `0.5px solid ${VIBRANCY_BORDER}`,
        }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ marginRight: 1 }}>
            <path d="M12.5 15L7.5 10L12.5 5" stroke="rgb(var(--overlay-light-rgb))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {restaurant.name}
        </Link>
      </div>

      {/* Bottom overlay — Apple-style info card */}
      <DishOverlayCard
        dish={dish}
        slug={slug}
        accent={accent}
        pair={pair}
      />
    </div>
  );
}

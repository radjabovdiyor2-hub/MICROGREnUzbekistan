import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata, Viewport } from 'next';
import { loadRestaurantBySlug, loadDishByCode, loadMenu } from '@/lib/magazine/restaurantMenu';
import { formatPrice } from '@/lib/magazine/menu';
import { MenuTracker } from '@/components/menu/MenuTracker';
import { DishVideo } from '@/components/menu/DishVideo';

// Страница блюда — Apple-стиль просмотр по QR-коду.
export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  themeColor: '#000000',
};

// Apple-style constants
const FONT = "-apple-system, 'SF Pro Text', 'SF Pro Display', 'Inter', 'Helvetica Neue', sans-serif";
const DISPLAY_FONT = "-apple-system, 'SF Pro Display', 'Inter', 'Helvetica Neue', sans-serif";
const VIBRANCY = 'rgba(30, 30, 30, 0.65)';
const VIBRANCY_BORDER = 'rgba(255, 255, 255, 0.18)';
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
      background: '#000',
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
            <path d="M12.5 15L7.5 10L12.5 5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {restaurant.name}
        </Link>
      </div>

      {/* Bottom overlay — Apple-style info card */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.85) 30%, rgba(0,0,0,0.65) 50%, rgba(0,0,0,0.35) 65%, rgba(0,0,0,0.12) 80%, transparent 100%)',
        paddingTop: 100,
        paddingBottom: `calc(env(safe-area-inset-bottom, 16px) + 16px)`,
        paddingLeft: 20,
        paddingRight: 20,
        animation: 'reels-slide-up 0.8s cubic-bezier(0.25, 0.1, 0.25, 1) 0.4s both',
      }}>
        {/* Dish name — Apple Large Title style */}
        <h1 style={{
          fontFamily: DISPLAY_FONT,
          fontSize: 'clamp(28px, 8vw, 34px)',
          fontWeight: 700,
          color: 'var(--text-inverse)',
          lineHeight: 1.06,
          margin: 0,
          letterSpacing: 0.36,
        }}>{dish.nameRu}</h1>

        {dish.nameUz && (
          <div style={{
            fontFamily: FONT,
            fontSize: 15,
            fontWeight: 400,
            color: 'rgba(255,255,255,0.55)',
            marginTop: 2,
            letterSpacing: -0.24,
          }}>{dish.nameUz}</div>
        )}

        {/* Price — Apple headline style */}
        {formatPrice(dish.price) && (
          <div style={{
            fontFamily: DISPLAY_FONT,
            fontSize: 20,
            fontWeight: 600,
            color: accent,
            marginTop: 6,
            letterSpacing: 0.38,
          }}>{formatPrice(dish.price)}</div>
        )}

        {/* Description */}
        {(dish.descriptionRu || dish.descriptionUz) && (
          <div style={{
            fontFamily: FONT,
            fontSize: 15,
            lineHeight: 1.4,
            fontWeight: 400,
            color: 'rgba(255,255,255,0.7)',
            marginTop: 8,
            letterSpacing: -0.24,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
          }}>
            {dish.descriptionRu}
            {dish.descriptionUz && (
              <span style={{
                display: 'block',
                fontSize: 13,
                color: 'rgba(255,255,255,0.45)',
                marginTop: 2,
                letterSpacing: -0.08,
              }}>
                {dish.descriptionUz}
              </span>
            )}
          </div>
        )}

        {/* Action button — Apple-style filled rounded rect */}
        <Link
          href={`/m/${slug}/frame/${dish.code}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            marginTop: 16,
            padding: '14px 20px',
            borderRadius: 14,
            background: accent,
            color: 'var(--text-inverse)',
            fontFamily: FONT,
            fontSize: 17,
            fontWeight: 600,
            letterSpacing: -0.41,
            textDecoration: 'none',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="2.5" y="4" width="15" height="12" rx="2" stroke="#fff" strokeWidth="1.5"/>
            <circle cx="10" cy="10" r="3" stroke="#fff" strokeWidth="1.5"/>
            <circle cx="14" cy="6.5" r="1" fill="#fff"/>
          </svg>
          Снять кадр
        </Link>

        {/* Upsell — Apple-style secondary card */}
        {pair && (
          <Link
            href={`/m/${slug}/d/${pair.code}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginTop: 10,
              padding: '10px 12px',
              borderRadius: 12,
              textDecoration: 'none',
              background: VIBRANCY,
              backdropFilter: BLUR,
              WebkitBackdropFilter: BLUR,
              border: `0.5px solid ${VIBRANCY_BORDER}`,
            }}
          >
            {pair.photo && (
              <img
                src={pair.photo}
                alt=""
                style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: FONT,
                fontSize: 11,
                fontWeight: 500,
                color: 'rgba(255,255,255,0.45)',
                textTransform: 'uppercase',
                letterSpacing: 0.56,
              }}>С чем берут</div>
              <div style={{
                fontFamily: FONT,
                fontSize: 15,
                fontWeight: 500,
                color: 'var(--text-inverse)',
                letterSpacing: -0.24,
              }}>{pair.nameRu}</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.4 }}>
              <path d="M6 3L11 8L6 13" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
        )}
      </div>
    </div>
  );
}

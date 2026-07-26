import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { loadRestaurantBySlug, loadDishByCode, loadMenu } from '@/lib/magazine/restaurantMenu';
import { formatPrice } from '@/lib/magazine/menu';
import { MenuTracker } from '@/components/menu/MenuTracker';
import { DishVideo } from '@/components/menu/DishVideo';

// Страница блюда — Reels-стиль просмотр по QR-коду.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string; code: string }> }): Promise<Metadata> {
  const { slug, code } = await params;
  const r = await loadRestaurantBySlug(slug);
  if (!r) return { title: 'Блюдо' };
  const dish = await loadDishByCode(r.id, Number(code));
  return { title: dish ? `${dish.nameRu} — ${r.name}` : r.name };
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

  const accent = restaurant.brandPrimary || '#10B981';
  const accentSecondary = restaurant.brandAccent || '#C9A84C';

  return (
    <div style={{
      width: '100vw',
      height: '100dvh',
      background: '#000',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <MenuTracker slug={slug} dishId={dish.id} />

      {/* Fullscreen media background — always covers entire viewport */}
      <DishVideo
        videoUrl={dish.videoUrl}
        videoPoster={dish.videoPoster}
        photo={dish.photo}
        alt={dish.nameRu}
        fullScreen={true}
      />

      {/* Back button — top-left, pill shape with blur */}
      <div style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 16px) + 16px)',
        left: 16,
        zIndex: 30,
        animation: 'reels-fade-in 0.8s ease-out 0.2s both',
      }}>
        <Link href={`/m/${slug}`} style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 13,
          fontWeight: 600,
          color: '#fff',
          textDecoration: 'none',
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          padding: '8px 14px',
          borderRadius: 20,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          border: '1px solid rgba(255, 255, 255, 0.15)',
        }}>← {restaurant.name}</Link>
      </div>

      {/* Bottom overlay — dish info card with gradient */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.7) 60%, rgba(0,0,0,0.2) 85%, transparent 100%)',
        paddingTop: 80,
        paddingBottom: `calc(env(safe-area-inset-bottom, 16px) + 16px)`,
        paddingLeft: 20,
        paddingRight: 20,
        animation: 'reels-slide-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.3s both',
      }}>
        {/* Dish name with shimmer highlight */}
        <h1 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 'clamp(26px, 7vw, 36px)',
          fontWeight: 900,
          color: '#fff',
          lineHeight: 1.1,
          margin: 0,
          textShadow: '0 2px 12px rgba(0,0,0,0.8)',
          background: `linear-gradient(90deg, #fff 0%, #fff 40%, ${accent} 50%, #fff 60%, #fff 100%)`,
          backgroundSize: '200% auto',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          animation: 'reels-shimmer 2s ease-in-out 1s 1',
        }}>{dish.nameRu}</h1>

        {dish.nameUz && (
          <div style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 14,
            color: 'rgba(255,255,255,0.6)',
            marginTop: 4,
          }}>{dish.nameUz}</div>
        )}

        {/* Price */}
        {formatPrice(dish.price) && (
          <div style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 24,
            fontWeight: 800,
            color: accent,
            marginTop: 8,
            textShadow: '0 1px 8px rgba(0,0,0,0.6)',
          }}>{formatPrice(dish.price)}</div>
        )}

        {/* Description */}
        {(dish.descriptionRu || dish.descriptionUz) && (
          <div style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 14,
            lineHeight: 1.5,
            color: 'rgba(255,255,255,0.8)',
            marginTop: 8,
            maxHeight: 60,
            overflow: 'hidden',
          }}>
            {dish.descriptionRu}
            {dish.descriptionUz && (
              <span style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                {dish.descriptionUz}
              </span>
            )}
          </div>
        )}

        {/* Action buttons row */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <Link
            href={`/m/${slug}/frame/${dish.code}`}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '14px 16px',
              borderRadius: 14,
              background: `linear-gradient(135deg, ${accent}, ${accentSecondary})`,
              color: '#fff',
              fontFamily: "'Inter', sans-serif",
              fontSize: 15,
              fontWeight: 800,
              textDecoration: 'none',
              boxShadow: `0 4px 20px ${accent}44`,
            }}
          >
            📸 Снять кадр
          </Link>
        </div>

        {/* Upsell — «С чем берут» */}
        {pair && (
          <Link
            href={`/m/${slug}/d/${pair.code}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginTop: 12,
              padding: 10,
              borderRadius: 14,
              textDecoration: 'none',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            {pair.photo && (
              <img
                src={pair.photo}
                alt=""
                style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
              />
            )}
            <div>
              <div style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 10,
                color: 'rgba(255,255,255,0.5)',
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}>С чем берут</div>
              <div style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                fontWeight: 600,
                color: '#fff',
              }}>{pair.nameRu}</div>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}

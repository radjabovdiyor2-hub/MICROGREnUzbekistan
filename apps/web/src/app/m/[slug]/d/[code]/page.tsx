import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { loadRestaurantBySlug, loadDishByCode, loadMenu } from '@/lib/magazine/restaurantMenu';
import { formatPrice } from '@/lib/magazine/menu';
import { MenuTracker } from '@/components/menu/MenuTracker';
import { DishVideo } from '@/components/menu/DishVideo';

// Страница блюда — то, куда ведёт QR со страницы журнала.
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

  // «С чем берут» — апселл
  const menu = await loadMenu(restaurant.id);
  const pair = dish.pairsWith
    ? menu.find((d) => d.nameRu.toLowerCase() === dish.pairsWith!.toLowerCase())
    : undefined;

  const accent = restaurant.brandPrimary || '#10B981';
  const hasVideo = !!dish.videoUrl;

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-primary, #0B0B14)', position: 'relative', overflowX: 'hidden' }}>
      <MenuTracker slug={slug} dishId={dish.id} />

      {/* Полноэкранное видео при открытии QR-кода */}
      {hasVideo && (
        <DishVideo
          videoUrl={dish.videoUrl}
          videoPoster={dish.videoPoster}
          photo={dish.photo}
          alt={dish.nameRu}
          fullScreen={true}
        />
      )}

      {/* Контент поверх видео или обычный макет */}
      <div style={{
        position: hasVideo ? 'relative' : 'relative',
        zIndex: 10,
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: hasVideo ? 'space-between' : 'flex-start',
        padding: hasVideo ? '20px 16px 30px' : '90px 16px 60px',
        maxWidth: 560,
        margin: '0 auto',
        boxSizing: 'border-box',
      }}>
        {/* Кнопка "Назад" поверх видео */}
        <div>
          <Link href={`/m/${slug}`} style={{
            fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600,
            color: '#fff', textDecoration: 'none',
            background: hasVideo ? 'rgba(0, 0, 0, 0.65)' : 'transparent',
            backdropFilter: hasVideo ? 'blur(10px)' : undefined,
            padding: hasVideo ? '8px 16px' : 0,
            borderRadius: 20,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: hasVideo ? '0 4px 12px rgba(0,0,0,0.3)' : undefined,
          }}>← {restaurant.name}</Link>
        </div>

        {/* Если видео нет — показываем плашку в обычном стиле */}
        {!hasVideo && (
          <DishVideo
            videoUrl={dish.videoUrl}
            videoPoster={dish.videoPoster}
            photo={dish.photo}
            alt={dish.nameRu}
            fullScreen={false}
          />
        )}

        {/* Карточка описания блюда (снизу при полноэкранном видео) */}
        <div style={{
          background: hasVideo ? 'linear-gradient(to top, rgba(0,0,0,0.95) 70%, rgba(0,0,0,0.4) 90%, transparent)' : 'transparent',
          padding: hasVideo ? '24px 16px 16px' : 0,
          borderRadius: hasVideo ? 24 : 0,
          marginTop: hasVideo ? 'auto' : 0,
          backdropFilter: hasVideo ? 'blur(8px)' : undefined,
        }}>
          <h1 style={{
            fontFamily: "'Playfair Display', serif", fontSize: 'clamp(24px, 6vw, 34px)',
            fontWeight: 900, color: '#fff', lineHeight: 1.1, margin: 0,
            textShadow: hasVideo ? '0 2px 8px rgba(0,0,0,0.8)' : undefined,
          }}>{dish.nameRu}</h1>

          {dish.nameUz && (
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>
              {dish.nameUz}
            </div>
          )}

          {formatPrice(dish.price) && (
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 800, color: accent, marginTop: 8 }}>
              {formatPrice(dish.price)}
            </div>
          )}

          {(dish.descriptionRu || dish.descriptionUz) && (
            <div style={{
              fontFamily: "'Inter', sans-serif", fontSize: 14, lineHeight: 1.5,
              color: 'rgba(255,255,255,0.85)', marginTop: 10,
            }}>
              {dish.descriptionRu}
              {dish.descriptionUz && (
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>{dish.descriptionUz}</div>
              )}
            </div>
          )}

          <Link
            href={`/m/${slug}/frame/${dish.code}`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              marginTop: 18, padding: '16px 20px', borderRadius: 16,
              background: `linear-gradient(135deg, ${accent}, ${restaurant.brandAccent || '#C9A84C'})`,
              color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 800,
              textDecoration: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            }}
          >
            📸 Снять кадр
          </Link>

          {pair && (
            <Link
              href={`/m/${slug}/d/${pair.code}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, marginTop: 16,
                padding: 10, borderRadius: 14, textDecoration: 'none',
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            >
              {pair.photo && <img src={pair.photo} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover' }} />}
              <div>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1 }}>
                  С чем берут
                </div>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: '#fff' }}>
                  {pair.nameRu}
                </div>
              </div>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

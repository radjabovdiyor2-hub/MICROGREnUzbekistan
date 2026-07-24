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

  // «С чем берут» — апселл: ведём на соседнее блюдо, если оно есть в меню
  const menu = await loadMenu(restaurant.id);
  const pair = dish.pairsWith
    ? menu.find((d) => d.nameRu.toLowerCase() === dish.pairsWith!.toLowerCase())
    : undefined;

  const accent = restaurant.brandPrimary || '#10B981';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #0B0B14)', padding: '90px 16px 60px' }}>
      <MenuTracker slug={slug} dishId={dish.id} />
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <Link href={`/m/${slug}`} style={{
          fontFamily: "'Inter', sans-serif", fontSize: 14,
          color: 'var(--text-secondary)', textDecoration: 'none',
        }}>← {restaurant.name}</Link>

        <DishVideo
          videoUrl={dish.videoUrl}
          videoPoster={dish.videoPoster}
          photo={dish.photo}
          alt={dish.nameRu}
        />

        <h1 style={{
          fontFamily: "'Playfair Display', serif", fontSize: 'clamp(26px, 6vw, 36px)',
          fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.1, marginTop: 16,
        }}>{dish.nameRu}</h1>
        {dish.nameUz && (
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, color: 'var(--text-muted, #999)', marginTop: 4 }}>
            {dish.nameUz}
          </div>
        )}

        {formatPrice(dish.price) && (
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 800, color: accent, marginTop: 10 }}>
            {formatPrice(dish.price)}
          </div>
        )}

        {(dish.descriptionRu || dish.descriptionUz) && (
          <div style={{
            fontFamily: "'Inter', sans-serif", fontSize: 15, lineHeight: 1.6,
            color: 'var(--text-secondary)', marginTop: 14,
          }}>
            {dish.descriptionRu}
            {dish.descriptionUz && (
              <div style={{ fontSize: 13, color: 'var(--text-muted, #999)', marginTop: 6 }}>{dish.descriptionUz}</div>
            )}
          </div>
        )}

        <Link
          href={`/m/${slug}/frame/${dish.code}`}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            marginTop: 24, padding: '18px 24px', borderRadius: 20,
            background: `linear-gradient(135deg, ${accent}, ${restaurant.brandAccent || '#C9A84C'})`,
            color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 17, fontWeight: 800,
            textDecoration: 'none',
          }}
        >
          📸 Снять кадр
        </Link>
        <p style={{
          fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--text-muted, #999)',
          textAlign: 'center', marginTop: 10, lineHeight: 1.5,
        }}>
          Готовый кадр в фирменной рамке {restaurant.name}.<br />
          Лучшие печатаем в следующем номере журнала.
        </p>

        {pair && (
          <Link
            href={`/m/${slug}/d/${pair.code}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, marginTop: 28,
              padding: 12, borderRadius: 16, textDecoration: 'none',
              background: 'var(--bg-elevated, rgba(255,255,255,0.03))',
              border: '1px solid var(--border, rgba(255,255,255,0.06))',
            }}
          >
            {pair.photo && <img src={pair.photo} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover' }} />}
            <div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: 'var(--text-muted, #999)', textTransform: 'uppercase', letterSpacing: 1 }}>
                С чем берут
              </div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                {pair.nameRu}
              </div>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}

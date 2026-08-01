import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { loadRestaurantBySlug, loadMenu, loadApprovedPhotos } from '@/lib/magazine/restaurantMenu';
import { formatPrice, DISH_CATEGORY_LABELS, isDishCategory } from '@/lib/magazine/menu';
import { MenuTracker } from '@/components/menu/MenuTracker';
import { LoyaltyCard } from '@/components/menu/LoyaltyCard';

// Витрина ресторана: меню + лента кадров гостей.
// Короткий адрес /m/<slug> — он печатается в журнале и его набирают руками.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = await loadRestaurantBySlug(slug);
  return { title: r ? `Меню ${r.name}` : 'Меню' };
}

export default async function MenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const restaurant = await loadRestaurantBySlug(slug);
  if (!restaurant) notFound();

  const [dishes, photos] = await Promise.all([
    loadMenu(restaurant.id),
    loadApprovedPhotos(restaurant.id),
  ]);

  const accent = restaurant.brandPrimary || 'var(--brand-primary)';
  const gold = restaurant.brandAccent || 'var(--brand-accent)';

  const grouped = dishes.reduce<Record<string, typeof dishes>>((acc, d) => {
    const key = d.category && isDishCategory(d.category) ? d.category : 'other';
    (acc[key] ||= []).push(d);
    return acc;
  }, {});

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '90px 16px 60px' }}>
      <MenuTracker slug={slug} />
      <div style={{ maxWidth: 640, margin: '0 auto' }}>

        <LoyaltyCard slug={slug} accent={accent} />

        <header style={{ textAlign: 'center', marginBottom: 28, marginTop: 28 }}>
          {restaurant.logo && (
            <img
              src={restaurant.logo}
              alt={restaurant.name}
              style={{ width: 72, height: 72, borderRadius: 20, objectFit: 'cover', marginBottom: 12 }}
            />
          )}
          <h1 style={{
            fontFamily: "'Playfair Display', serif", fontSize: 'clamp(28px, 7vw, 40px)',
            fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.1,
          }}>{restaurant.name}</h1>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: 'var(--text-secondary)', marginTop: 8 }}>
            Живое меню · FRESH WEEKLY
          </p>
          {restaurant.instagram && (
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: accent, marginTop: 4 }}>
              {restaurant.instagram.startsWith('@') ? restaurant.instagram : `@${restaurant.instagram}`}
            </p>
          )}
        </header>

        {dishes.length === 0 ? (
          <p style={{
            fontFamily: "'Inter', sans-serif", color: 'var(--text-secondary)',
            textAlign: 'center', padding: '40px 0',
          }}>
            Меню скоро появится.
          </p>
        ) : (
          Object.entries(grouped).map(([category, items]) => (
            <section key={category} style={{ marginBottom: 28 }}>
              <h2 style={{
                fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: 1.2, color: gold, marginBottom: 12,
              }}>
                {isDishCategory(category) ? DISH_CATEGORY_LABELS[category].ru : 'Прочее'}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {items.map((d) => (
                  <Link
                    key={d.id}
                    href={`/m/${slug}/d/${d.code}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: 12, borderRadius: 16, textDecoration: 'none',
                      background: 'var(--bg-elevated, rgba(var(--overlay-light-rgb), 0.03))',
                      border: '1px solid var(--border, rgba(var(--overlay-light-rgb), 0.06))',
                    }}
                  >
                    {d.photo && (
                      <img src={d.photo} alt="" style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {d.nameRu}
                      </div>
                      {d.nameUz && (
                        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: 'var(--text-muted, var(--text-muted))' }}>{d.nameUz}</div>
                      )}
                      {formatPrice(d.price) && (
                        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 700, color: accent, marginTop: 2 }}>
                          {formatPrice(d.price)}
                        </div>
                      )}
                    </div>
                    <span style={{ color: 'var(--text-muted, var(--text-muted))', fontSize: 18 }}>›</span>
                  </Link>
                ))}
              </div>
            </section>
          ))
        )}

        {photos.length > 0 && (
          <section style={{ marginTop: 36 }}>
            <h2 style={{
              fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 800,
              color: 'var(--text-primary)', marginBottom: 4,
            }}>Кадры гостей</h2>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
              Лучшие печатаем в следующем номере журнала.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {photos.map((p) => (
                <figure key={p.id} style={{ margin: 0 }}>
                  <img
                    src={p.imageUrl}
                    alt={p.guestName ?? ''}
                    style={{ width: '100%', aspectRatio: '9 / 16', objectFit: 'cover', borderRadius: 10, display: 'block' }}
                  />
                  {p.guestName && (
                    <figcaption style={{
                      fontFamily: "'Inter', sans-serif", fontSize: 11,
                      color: 'var(--text-muted, var(--text-muted))', marginTop: 4, textAlign: 'center',
                    }}>{p.guestName}</figcaption>
                  )}
                </figure>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

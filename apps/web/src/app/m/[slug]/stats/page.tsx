import { notFound } from 'next/navigation';
import { prisma } from '@repo/database';
import { loadRestaurantBySlug, loadMenu } from '@/lib/magazine/restaurantMenu';

// Отчёт владельцу ресторана. Это единственная страница, где видно,
// что журнал реально что-то делает: без цифр подписку на тираж не продлевают.
export const dynamic = 'force-dynamic';

const DAYS = 30;

export default async function StatsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const restaurant = await loadRestaurantBySlug(slug);
  if (!restaurant) notFound();

  const since = new Date();
  since.setDate(since.getDate() - DAYS);

  const [events, dishes, photoCounts] = await Promise.all([
    prisma.magazineEvent.groupBy({
      by: ['type'],
      where: { slug, createdAt: { gte: since } },
      _count: true,
    }),
    loadMenu(restaurant.id),
    prisma.guestPhoto.groupBy({
      by: ['status'],
      where: { restaurantId: restaurant.id, createdAt: { gte: since } },
      _count: true,
    }),
  ]);

  const count = (type: string) => events.find((e) => e.type === type)?._count ?? 0;
  const photos = (status: string) => photoCounts.find((p) => p.status === status)?._count ?? 0;

  // Топ блюд по сканам QR — какая страница меню реально работает
  const dishViews = await prisma.magazineEvent.groupBy({
    by: ['dishId'],
    where: { slug, type: 'dish_view', createdAt: { gte: since }, dishId: { not: null } },
    _count: true,
    orderBy: { _count: { dishId: 'desc' } },
    take: 5,
  });
  const dishById = new Map(dishes.map((d) => [d.id, d]));

  const accent = restaurant.brandPrimary || 'var(--brand-primary)';
  const tiles = [
    { label: 'Открытий меню', value: count('page_view') },
    { label: 'Сканов блюд', value: count('dish_view') },
    { label: 'Открытий камеры', value: count('frame_open') },
    { label: 'Снятых кадров', value: count('photo_submitted') },
    { label: 'Сохранений и шеров', value: count('photo_shared') },
    { label: 'Напечатано в журнале', value: photos('printed') },
    { label: 'Штампов выдано', value: count('stamp_earned') },
    { label: 'Наград получено', value: count('reward_issued') },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #0B0B14)', padding: '90px 16px 60px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{
          fontFamily: "'Playfair Display', serif", fontSize: 'clamp(26px, 6vw, 38px)',
          fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.1,
        }}>{restaurant.name}</h1>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: 'var(--text-secondary)', marginTop: 8 }}>
          Живое меню · последние {DAYS} дней
        </p>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12, marginTop: 24,
        }}>
          {tiles.map((t) => (
            <div key={t.label} style={{
              padding: 18, borderRadius: 18,
              background: 'var(--bg-elevated, rgba(255,255,255,0.03))',
              border: '1px solid var(--border, rgba(255,255,255,0.06))',
            }}>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 30, fontWeight: 800, color: accent }}>
                {t.value}
              </div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                {t.label}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 16, padding: 16, borderRadius: 16,
          background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border, rgba(255,255,255,0.06))',
          fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6,
        }}>
          Кадров ждут модерации: <strong style={{ color: 'var(--text-primary)' }}>{photos('pending')}</strong>,
          одобрено: <strong style={{ color: 'var(--text-primary)' }}>{photos('approved')}</strong>.
        </div>

        {dishViews.length > 0 && (
          <section style={{ marginTop: 32 }}>
            <h2 style={{
              fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: 1.2,
              color: 'var(--text-muted, #999)', marginBottom: 12,
            }}>Топ блюд по сканам</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dishViews.map((row) => {
                const dish = row.dishId ? dishById.get(row.dishId) : undefined;
                return (
                  <div key={row.dishId} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 16px', borderRadius: 14,
                    background: 'var(--bg-elevated, rgba(255,255,255,0.03))',
                    fontFamily: "'Inter', sans-serif", fontSize: 14,
                  }}>
                    <span style={{ color: 'var(--text-primary)' }}>{dish?.nameRu ?? 'Удалённое блюдо'}</span>
                    <span style={{ color: accent, fontWeight: 700 }}>{row._count}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

'use client';

import * as Icons from '@/components/ui/Icons';
import { useFavorites } from '@/components/providers/FavoritesProvider';
import { ProductCard } from '@/components/shop/ProductCard';

export default function FavoritesPage() {
  const { favorites } = useFavorites();

  return (
    <div className="container" style={{ paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-8)' }}>
      <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Icons.HeartFilled size={28} style={{ color: 'var(--error)' }} /> Sevimlilar
        {favorites.length > 0 && (
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontWeight: 'var(--font-normal)' }}>
            ({favorites.length})
          </span>
        )}
      </h1>

      {favorites.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-16)', color: 'var(--text-muted)' }}>
          <div style={{ marginBottom: 'var(--space-4)' }}><Icons.Heart size={80} /></div>
          <h3 style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
            Sevimlilar bo&apos;sh
          </h3>
          <p style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)' }}>
            Mahsulot kartalardagi yurak belgisini bosing
          </p>
          <a href="/catalog" className="btn btn-primary btn-lg" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <Icons.Folder size={20} /> Katalogga o&apos;tish
          </a>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 'var(--space-4)',
        }}>
          {favorites.map(fav => (
            <ProductCard
              key={fav.id}
              product={{
                ...fav,
                nameRu: fav.nameUz,
                rating: fav.rating || 0,
                reviewCount: 0,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

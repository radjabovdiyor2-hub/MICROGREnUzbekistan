'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProductCard } from '@/components/shop/ProductCard';
import * as Icons from '@/components/ui/Icons';
import { useLang } from '@/components/providers/LangProvider';

interface Product {
  id: string;
  nameUz: string;
  nameRu: string;
  slug: string;
  price: number;
  oldPrice?: number | null;
  images: string[];
  rating: number;
  reviewCount: number;
  isOnSale?: boolean;
  category?: { nameUz: string; slug: string };
}

export function FeaturedProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useLang();

  useEffect(() => {
    fetch('/api/products?featured=true&limit=6')
      .then(r => r.json())
      .then(data => {
        setProducts(data.items || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <section className="section" id="featured-section">
      <div className="container">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)' }}>
          <h2 className="section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Icons.StarFilled size={24} style={{ color: 'var(--brand-accent)' }} /> {t('Top Mahsulotlar', 'Топ товары')}
          </h2>
          <Link href="/catalog" className="btn btn-ghost btn-sm">
            {t('featured.all')} →
          </Link>
        </div>

        {loading ? (
          <div className="product-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card" style={{ overflow: 'hidden' }}>
                <div className="skeleton" style={{ width: '100%', aspectRatio: '1' }} />
                <div style={{ padding: 'var(--space-3)' }}>
                  <div className="skeleton" style={{ width: '60%', height: 12, marginBottom: 8, borderRadius: 6 }} />
                  <div className="skeleton" style={{ width: '90%', height: 14, marginBottom: 8, borderRadius: 6 }} />
                  <div className="skeleton" style={{ width: '40%', height: 16, borderRadius: 6 }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="product-grid">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

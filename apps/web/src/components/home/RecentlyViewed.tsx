'use client';

import { useEffect, useState } from 'react';
import { ProductCard } from '@/components/shop/ProductCard';
import * as Icons from '@/components/ui/Icons';
import { useLang } from '@/components/providers/LangProvider';
import { getViewed, ViewedProduct } from '@/lib/recentlyViewed';

// "Вы недавно смотрели" — brings returning visitors straight back to what
// they were considering (pattern of every major marketplace). Renders nothing
// on first visit; reads localStorage only on the client.
export function RecentlyViewed() {
  const { t } = useLang();
  const [items, setItems] = useState<ViewedProduct[]>([]);

  useEffect(() => {
    setItems(getViewed().slice(0, 4));
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="section" style={{ padding: 'var(--space-8) 0' }}>
      <div className="container">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: 'var(--space-4)' }}>
          <Icons.Clock size={22} style={{ color: 'var(--brand-primary)' }} />
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', fontSize: 'var(--text-xl)', margin: 0 }}>
            {t("Yaqinda ko'rganlaringiz", 'Вы недавно смотрели')}
          </h2>
        </div>
        <div className="product-grid">
          {items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </div>
    </section>
  );
}

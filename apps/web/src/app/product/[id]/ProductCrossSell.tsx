'use client';

import React from 'react';
import { ShoppingCart } from 'lucide-react';
import { ProductCard } from '@/components/shop/ProductCard';
import { SkeletonProductCard } from './productPageParts';

export interface RelatedProduct {
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
  category?: { nameUz: string; nameRu?: string; slug: string };
}

export function ProductCrossSell({
  related,
  relatedLoading,
  t,
}: {
  related: RelatedProduct[];
  relatedLoading: boolean;
  t: (uz: string, ru: string) => string;
}) {
  if (!relatedLoading && related.length === 0) return null;

  return (
    <div
      className="container"
      style={{
        position: 'relative',
        zIndex: 1,
        marginTop: 'var(--space-10)',
        paddingBottom: 'var(--space-8)',
      }}
    >
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 'var(--font-bold)',
          fontSize: 'var(--text-xl)',
          marginBottom: 'var(--space-4)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <ShoppingCart size={22} style={{ color: 'var(--brand-primary)' }} />
        {t('Bu bilan birga olishadi', 'С этим часто берут')}
      </h2>
      <div className="product-grid">
        {relatedLoading
          ? [1, 2, 3, 4].map((i) => <SkeletonProductCard key={i} />)
          : related.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </div>
  );
}

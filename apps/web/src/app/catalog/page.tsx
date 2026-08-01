'use client';

import { Suspense } from 'react';

import { CatalogContent } from './CatalogContent';

export function CatalogView({ initialCategory = '' }: { initialCategory?: string }) {
  return (
    <Suspense fallback={
      <div className="container" style={{ paddingTop: 'var(--space-6)' }}>
        <div className="skeleton skeleton-title" style={{ width: '200px', marginBottom: 'var(--space-6)' }} />
        <div className="product-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="product-card"><div className="skeleton skeleton-image" /></div>
          ))}
        </div>
      </div>
    }>
      <CatalogContent initialCategory={initialCategory} />
    </Suspense>
  );
}

export default function CatalogPage() {
  return (
    <Suspense fallback={
      <div className="container" style={{ paddingTop: 'var(--space-6)' }}>
        <div className="skeleton skeleton-title" style={{ width: '200px', marginBottom: 'var(--space-6)' }} />
        <div className="product-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="product-card"><div className="skeleton skeleton-image" /></div>
          ))}
        </div>
      </div>
    }>
      <CatalogContent />
    </Suspense>
  );
}

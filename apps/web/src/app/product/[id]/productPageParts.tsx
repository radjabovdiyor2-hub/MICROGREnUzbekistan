'use client';

import React, { useState } from 'react';
import { Droplet, Leaf, Package, Plug, Sparkles, Star } from 'lucide-react';

// Мелкие части страницы товара: иконки рубрик, строка звёзд и скелетон
// карточки. Вынесены из ProductPageClient — от его состояния не зависят.

export const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'microgreens': <Leaf size={64} />,
  'baby-leaf': <Leaf size={64} />,
  'salads': <Leaf size={64} />,
  'flowers': <Sparkles size={64} />,
  'seeds': <Droplet size={64} />,
  'equipment': <Plug size={64} />,
  'sets': <Package size={64} />,
};

export function getOrCreateGuestId(): string {
  try {
    const existing = localStorage.getItem('mg_guest_id');
    if (existing) return existing;
    const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
    localStorage.setItem('mg_guest_id', id);
    return id;
  } catch {
    return 'guest-fallback';
  }
}

export function StarRow({ value, onChange, readOnly = false }: {
  value: number;
  onChange?: (v: number) => void;
  readOnly?: boolean;
}) {
  const [hover, setHover] = useState(0);
  const active = hover || value;
  return (
    <div style={{ display: 'flex', gap: '2px' }} onMouseLeave={() => !readOnly && setHover(0)}>
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(s)}
          onMouseEnter={() => !readOnly && setHover(s)}
          style={{
            background: 'none', border: 'none',
            padding: readOnly ? 0 : '2px',
            cursor: readOnly ? 'default' : 'pointer',
            color: s <= active ? 'var(--brand-accent)' : 'var(--border)',
            transition: 'color var(--transition-fast)',
            lineHeight: 1,
          }}
          aria-label={`${s} stars`}
        >
          {s <= active
            ? <Star fill="currentColor" strokeWidth={1} size={readOnly ? 16 : 24} />
            : <Star size={readOnly ? 16 : 24} />}
        </button>
      ))}
    </div>
  );
}

export function SkeletonProductCard() {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div className="skeleton" style={{ width: '100%', aspectRatio: '1' }} />
      <div style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <div className="skeleton" style={{ height: 12, width: '60%' }} />
        <div className="skeleton" style={{ height: 14, width: '90%' }} />
        <div className="skeleton" style={{ height: 14, width: '70%' }} />
        <div className="skeleton" style={{ height: 32, width: '100%', borderRadius: 'var(--radius-sm)' }} />
      </div>
    </div>
  );
}

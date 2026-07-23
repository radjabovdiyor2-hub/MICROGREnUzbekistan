'use client';

import { useState } from 'react';
import { useCart } from '@/components/providers/CartProvider';
import { trackEvent } from '@/lib/magazine/track';
import type { RecipeCartProduct } from '@/lib/recipes';

/* ─────────────────────────────────────────────
   «Собрать набор микрозелени»: кладёт в корзину все связанные с товаром
   ингредиенты рецепта. Переиспользует useCart().addItem().
   ───────────────────────────────────────────── */

export function CollectSetButton({ products, slug, accent }: {
  products: RecipeCartProduct[];
  slug: string;
  accent: string;
}) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  if (products.length === 0) return null;

  const collect = () => {
    products.forEach((p) => addItem(p, 1));
    trackEvent({ type: 'recipe_cart', slug });
    setAdded(true);
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <button
        onClick={collect}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          width: '100%', padding: '16px 20px', borderRadius: 16, border: 'none',
          background: added ? 'var(--bg-elevated, rgba(255,255,255,0.06))' : accent,
          color: added ? 'var(--text-primary)' : '#fff',
          fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        {added ? '✓ Набор в корзине' : `🛒 Собрать набор микрозелени (${products.length})`}
      </button>
      {added && (
        <a
          href="/cart"
          style={{
            display: 'block', textAlign: 'center', marginTop: 10,
            fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700,
            color: accent, textDecoration: 'none',
          }}
        >Перейти в корзину →</a>
      )}
    </div>
  );
}

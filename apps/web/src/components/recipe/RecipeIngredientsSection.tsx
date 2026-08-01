import React from 'react';
import Link from 'next/link';
import { CollectSetButton } from '@/components/recipe/CollectSetButton';
import { formatPrice } from '@/lib/magazine/menu';

import type { RecipeCartProduct } from '@/lib/recipes';

interface Ingredient {
  id: string;
  nameRu: string;
  amount?: string | null;
  product?: {
    id: string;
    price: number;
    images?: string[];
  } | null;
}

interface Props {
  ingredients: Ingredient[];
  cartProducts: RecipeCartProduct[];
  slug: string;
  accent: string;
}

export function RecipeIngredientsSection({ ingredients, cartProducts, slug, accent }: Props) {
  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 14 }}>
        Ингредиенты
      </h2>

      <CollectSetButton products={cartProducts} slug={slug} accent={accent} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ingredients.map((ing) => {
          const rowStyle = {
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 12px', borderRadius: 14,
            background: ing.product ? `${accent}0f` : 'var(--bg-elevated, rgba(var(--overlay-light-rgb), 0.03))',
            border: `1px solid ${ing.product ? `${accent}33` : 'var(--border, rgba(var(--overlay-light-rgb), 0.06))'}`,
            color: 'inherit', textDecoration: 'none',
          };
          const inner = (
            <>
              {ing.product?.images?.[0] && (
                <img src={ing.product.images[0]} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover' }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {ing.nameRu}
                  {ing.product && <span style={{ marginLeft: 6, fontSize: 12, color: accent }}>· в магазине</span>}
                </div>
                {ing.amount && (
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: 'var(--text-muted, var(--text-muted))' }}>{ing.amount}</div>
                )}
              </div>
              {ing.product && formatPrice(ing.product.price) && (
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 700, color: accent }}>
                  {formatPrice(ing.product.price)}
                </div>
              )}
            </>
          );
          return ing.product
            ? <Link key={ing.id} href={`/product/${ing.product.id}`} style={rowStyle}>{inner}</Link>
            : <div key={ing.id} style={rowStyle}>{inner}</div>;
        })}
      </div>
    </section>
  );
}

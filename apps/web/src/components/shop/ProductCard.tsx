'use client';

import { ProductCardBody } from './ProductCardBody';

import { getDiscountPercent } from '@repo/shared';
import Link from 'next/link';
import { useState } from 'react';
import { Flame, Heart } from 'lucide-react';
import { useCart } from '@/components/providers/CartProvider';
import { useFavorites } from '@/components/providers/FavoritesProvider';
import { useLang } from '@/components/providers/LangProvider';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';

const ArViewer = dynamic(() => import('@/components/ui/ArViewer').then(m => m.ArViewer), { ssr: false });

const spring = { type: 'spring' as const, damping: 20, stiffness: 300 };

export interface Product {
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

export function ProductCard({ product }: { product: Product }) {
  const discount = product.oldPrice ? getDiscountPercent(product.price, product.oldPrice) : 0;
  const categorySlug = product.category?.slug || '';
  const cart = useCart();
  const { toggleFavorite, isFavorite } = useFavorites();
  const fav = isFavorite(product.id);
  const inCartQty = cart.items.find(i => i.product.id === product.id)?.quantity ?? 0;
  const { lang, t } = useLang();
  const productName = lang === 'ru' && product.nameRu ? product.nameRu : product.nameUz;
  const [added, setAdded] = useState(false);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    import('@/utils/haptic').then(({ triggerHaptic }) => triggerHaptic('success'));

    setAdded(true);
    setTimeout(() => setAdded(false), 1600);

    cart.addItem({
      id: product.id,
      nameUz: product.nameUz,
      nameRu: product.nameRu,
      price: product.price,
      oldPrice: product.oldPrice,
      slug: product.slug,
      images: product.images,
      category: product.category,
    });
  };

  const handleToggleFav = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    import('@/utils/haptic').then(({ triggerHaptic }) => triggerHaptic(fav ? 'light' : 'medium'));

    toggleFavorite({
      id: product.id,
      nameUz: product.nameUz,
      price: product.price,
      oldPrice: product.oldPrice,
      slug: product.slug,
      images: product.images,
      rating: product.rating,
      category: product.category,
    });
  };

  return (
    <Link href={`/product/${product.id}`} className="product-card card" id={`product-${product.id}`}
      style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', height: '100%' }}>

      {/* Discount Badge */}
      {discount > 0 && (
        <span style={{
          position: 'absolute', top: 8, left: 8, zIndex: 2,
          padding: '4px 8px', background: 'var(--error)', color: 'white',
          borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)',
          display: 'flex', alignItems: 'center', gap: '4px',
        }}>
          <Flame size={12} /> -{discount}%
        </span>
      )}

      {/* Favorite — spring pop on tap */}
      <motion.button
        onClick={handleToggleFav}
        whileTap={{ scale: 1.35 }}
        transition={spring}
        style={{
          position: 'absolute', top: 8, right: 8, zIndex: 2,
          background: fav ? 'var(--error)' : 'var(--scrim)', border: 'none',
          borderRadius: 'var(--radius-full)', width: 32, height: 32,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: 'white', transition: 'background var(--transition-fast)',
        }}
        aria-label="Toggle favorite"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={fav ? 'filled' : 'outline'}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={spring}
            style={{ display: 'flex' }}
          >
            <Heart size={16} fill={fav ? 'currentColor' : 'none'} />
          </motion.span>
        </AnimatePresence>
      </motion.button>

      <ProductCardBody
        product={product}
        productName={productName}
        categorySlug={categorySlug}
        cart={cart}
        inCartQty={inCartQty}
        added={added}
        handleAddToCart={handleAddToCart}
      />
    </Link>
  );
}

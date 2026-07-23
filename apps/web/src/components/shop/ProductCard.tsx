'use client';

import { formatPrice, getDiscountPercent } from '@repo/shared';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import {
  Flame, Heart, ShoppingCart, CheckCircle, Star, Minus, Plus,
} from 'lucide-react';
import { useCart } from '@/components/providers/CartProvider';
import { useFavorites } from '@/components/providers/FavoritesProvider';
import { useLang } from '@/components/providers/LangProvider';
import { MicrogreensCanvas, seedFromString } from '@/components/ui/MicrogreensCanvas';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';

const ArViewer = dynamic(() => import('@/components/ui/ArViewer').then(m => m.ArViewer), { ssr: false });

const spring = { type: 'spring' as const, damping: 20, stiffness: 300 };

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

    import('@/lib/haptic').then(({ triggerHaptic }) => triggerHaptic('success'));

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

    import('@/lib/haptic').then(({ triggerHaptic }) => triggerHaptic(fav ? 'light' : 'medium'));

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
      style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

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
          background: fav ? 'var(--error)' : 'rgba(0,0,0,0.3)', border: 'none',
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

      {/* Image */}
      <div style={{
        width: '100%', aspectRatio: '1', background: 'var(--bg-tertiary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', overflow: 'hidden',
      }}>
        {product.images && product.images.length > 0
          ? <Image src={product.images[0]} alt={productName} width={400} height={400} style={{ width: '100%', height: '100%', objectFit: 'cover' }} sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" loading="lazy" quality={75} unoptimized={!product.images[0].startsWith('https://') && !product.images[0].startsWith('http://')} />
          : <MicrogreensCanvas count={20} staticAfterGrow seed={seedFromString(product.id)} style={{ width: '100%', height: '100%' }} />}
      </div>

      {/* Info */}
      <div style={{ padding: 'var(--space-3)', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-1)' }}>
          {lang === 'ru' ? (product.category as any)?.nameRu || product.category?.nameUz : product.category?.nameUz}
        </div>
        <div style={{
          fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)',
          marginBottom: 'var(--space-2)', flex: 1,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {productName}
        </div>

        {/* Rating */}
        {product.rating > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: 'var(--space-2)' }}>
            <Star size={14} fill="#F59E0B" strokeWidth={1} style={{ color: '#F59E0B' }} />
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)' }}>{product.rating}</span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>({product.reviewCount})</span>
          </div>
        )}

        {/* Price */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', color: 'var(--brand-primary)' }}>
            {formatPrice(product.price)} {t('product.currency')}
          </span>
          {product.oldPrice && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textDecoration: 'line-through' }}>
              {formatPrice(product.oldPrice)}
            </span>
          )}
        </div>

        {/* Add to cart — AnimatePresence for smooth state transitions */}
        <AnimatePresence mode="wait" initial={false}>
          {inCartQty > 0 ? (
            <motion.div
              key="stepper"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={spring}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderRadius: 'var(--radius-sm)', overflow: 'hidden',
                background: 'var(--brand-primary)', color: '#fff',
              }}>
              <button
                aria-label="−"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); cart.updateQuantity(product.id, inCartQty - 1); }}
                style={{
                  width: 36, height: 32, border: 'none', cursor: 'pointer',
                  background: 'transparent', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                <Minus size={14} />
              </button>
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={inCartQty}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-sm)' }}
                >
                  {inCartQty}
                </motion.span>
              </AnimatePresence>
              <button
                aria-label="+"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); cart.updateQuantity(product.id, inCartQty + 1); }}
                style={{
                  width: 36, height: 32, border: 'none', cursor: 'pointer',
                  background: 'transparent', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                <Plus size={14} />
              </button>
            </motion.div>
          ) : (
            <motion.button
              key={added ? 'added' : 'add'}
              className="btn btn-sm btn-block"
              onClick={handleAddToCart}
              aria-label={t('product.add_to_cart')}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              whileTap={{ scale: 0.93 }}
              transition={spring}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                border: 'none', color: '#fff', fontWeight: 'var(--font-semibold)',
                background: added ? 'var(--success)' : 'var(--brand-primary)',
              }}
            >
              {added
                ? <><CheckCircle size={14} /> {t("Qo'shildi", 'Добавлено')}</>
                : <><ShoppingCart size={14} /> {t('product.add_to_cart')}</>}
            </motion.button>
          )}
        </AnimatePresence>
        {/* AR Viewer for equipment */}
        {categorySlug === 'equipment' && (
          <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
            <ArViewer />
          </div>
        )}
      </div>
    </Link>
  );
}

'use client';

import Image from 'next/image';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, Minus, Plus, ShoppingCart, Star } from 'lucide-react';
import { MicrogreensCanvas, seedFromString } from '@/components/ui/MicrogreensCanvas';
import { formatPrice } from '@repo/shared';
import { useLang } from '@/components/providers/LangProvider';
import type { useCart } from '@/components/providers/CartProvider';
import type { Product } from './productTypes';

const ArViewer = dynamic(() => import('@/components/ui/ArViewer').then(m => m.ArViewer), { ssr: false });

const spring = { type: 'spring' as const, damping: 20, stiffness: 300 };

// Внутренности карточки товара: изображение, цена, рейтинг и кнопка корзины.
// Вынесены из ProductCard — сама карточка осталась обёрткой со ссылкой,
// избранным и подсчётом производных значений.

interface Props {
  product: Product;
  productName: string;
  categorySlug: string;
  cart: ReturnType<typeof useCart>;
  inCartQty: number;
  added: boolean;
  handleAddToCart: (e: React.MouseEvent) => void;
}

export function ProductCardBody({
  product, productName, categorySlug, cart, inCartQty, added, handleAddToCart,
}: Props) {
  const { lang, t } = useLang();

  return (
    <>
{/* Image */}
<div style={{
  width: '100%', aspectRatio: '1', background: 'var(--bg-tertiary)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--text-muted)', overflow: 'hidden',
}}>
  {product.images && product.images.length > 0
    ? <Image src={product.images[0]} alt={productName} width={400} height={400} style={{ width: '100%', height: '100%', objectFit: 'cover' }} sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" loading="lazy" quality={75} />
    : <MicrogreensCanvas count={20} staticAfterGrow seed={seedFromString(product.id)} style={{ width: '100%', height: '100%' }} />}
</div>

{/* Info */}
<div style={{ padding: 'var(--space-3)', flex: 1, display: 'flex', flexDirection: 'column' }}>
  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-1)' }}>
    {lang === 'ru' ? (product.category as { nameRu?: string } | undefined)?.nameRu || product.category?.nameUz : product.category?.nameUz}
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
      <Star size={14} fill="currentColor" strokeWidth={0} style={{ color: 'var(--brand-accent)' }} />
      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)' }}>{product.rating}</span>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>({product.reviewCount})</span>
    </div>
  )}

  {/* Price */}
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', color: 'var(--brand-primary)' }}>
      {formatPrice(product.price)} {t('product.currency')}
      {/* Единица обязательна: микрозелень продаётся за лоток, бейби-лист за
          100 г, салаты за килограмм. Без неё «200 000 сум» у салата выглядит
          как цена за кочан, и покупатель уходит. */}
      {product.unit && (
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-normal)', color: 'var(--text-muted)' }}>
          {' / '}{product.unit}
        </span>
      )}
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
          background: 'var(--brand-primary)', color: 'var(--text-inverse)',
        }}>
        {/* 44 пикселя, а не 32.
            Дизайн-система поднимает `.btn-sm` до 44 на тач-устройствах
            (globals.css, @media (pointer: coarse)), но здесь высота прибита
            инлайном на сыром <button> — правило до неё не доставало. Палец
            промахивался мимо «минуса», стоящего вплотную к «плюсу».
            Подпись — словом: диктор читал «минус кнопка» и «плюс кнопка»,
            не называя, чего именно меньше. */}
        <button
          aria-label={t("Kamaytirish", "Уменьшить количество")}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); cart.updateQuantity(product.id, inCartQty - 1); }}
          style={{
            width: 44, height: 44, border: 'none', cursor: 'pointer',
            background: 'transparent', color: 'var(--text-inverse)',
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
          aria-label={t("Ko'paytirish", "Увеличить количество")}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); cart.updateQuantity(product.id, inCartQty + 1); }}
          style={{
            width: 44, height: 44, border: 'none', cursor: 'pointer',
            background: 'transparent', color: 'var(--text-inverse)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <Plus size={14} />
        </button>
      </motion.div>
    ) : (
      <motion.button
        key={added ? 'added' : 'add'}
        className={`btn btn-sm btn-block ${added ? 'btn-success' : 'btn-primary'}`}
        onClick={handleAddToCart}
        aria-label={t('product.add_to_cart')}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        whileTap={{ scale: 0.93 }}
        transition={spring}
        // Вид кнопки задаётся КЛАССОМ. Раньше здесь заново объявлялся
        // вариант — фон, цвет текста, рамка, — и правка `.btn-primary` в
        // дизайн-системе до главной кнопки каталога не доходила. Раскладка
        // тоже лишняя: `.btn` уже flex с нужным зазором.
        style={{ fontWeight: 'var(--font-semibold)' }}
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
    </>
  );
}

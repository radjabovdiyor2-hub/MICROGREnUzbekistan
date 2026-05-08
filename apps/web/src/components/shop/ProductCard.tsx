'use client';

import { formatPrice, getDiscountPercent } from '@repo/shared';
import Image from 'next/image';
import Link from 'next/link';
import * as Icons from '@/components/ui/Icons';
import { useCart } from '@/components/providers/CartProvider';
import { useFavorites } from '@/components/providers/FavoritesProvider';
import { useLang } from '@/components/providers/LangProvider';
import dynamic from 'next/dynamic';

const ArViewer = dynamic(() => import('@/components/ui/ArViewer').then(m => m.ArViewer), { ssr: false });

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

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'microgreens': <Icons.Leaf size={32} />,
  'baby-leaf': <Icons.Leaf size={32} />,
  'salads': <Icons.Leaf size={32} />,
  'flowers': <Icons.Sparkles size={32} />,
  'seeds': <Icons.Droplet size={32} />,
  'equipment': <Icons.Plug size={32} />,
  'sets': <Icons.Package size={32} />,
};

export function ProductCard({ product }: { product: Product }) {
  const discount = product.oldPrice ? getDiscountPercent(product.price, product.oldPrice) : 0;
  const categorySlug = product.category?.slug || '';
  const categoryIcon = CATEGORY_ICONS[categorySlug] || <Icons.Package size={32} />;
  const cart = useCart();
  const { toggleFavorite, isFavorite } = useFavorites();
  const fav = isFavorite(product.id);
  const { lang, t } = useLang();
  const productName = lang === 'ru' && product.nameRu ? product.nameRu : product.nameUz;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
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
          <Icons.Flame size={12} /> -{discount}%
        </span>
      )}

      {/* Favorite */}
      <button onClick={handleToggleFav}
        style={{
          position: 'absolute', top: 8, right: 8, zIndex: 2,
          background: fav ? 'var(--error)' : 'rgba(0,0,0,0.3)', border: 'none',
          borderRadius: 'var(--radius-full)', width: 32, height: 32,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: 'white', transition: 'all var(--transition-fast)',
        }} aria-label="Toggle favorite">
        {fav ? <Icons.HeartFilled size={16} /> : <Icons.Heart size={16} />}
      </button>

      {/* Image */}
      <div style={{
        width: '100%', aspectRatio: '1', background: 'var(--bg-tertiary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', overflow: 'hidden',
      }}>
        {product.images && product.images.length > 0
          ? <Image src={product.images[0]} alt={productName} width={400} height={400} style={{ width: '100%', height: '100%', objectFit: 'cover' }} sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" loading="lazy" quality={75} unoptimized={!product.images[0].startsWith('https://') && !product.images[0].startsWith('http://')} />
          : categoryIcon}
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
            <Icons.StarFilled size={14} style={{ color: '#F59E0B' }} />
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

        {/* Add to cart */}
        <button className="btn btn-primary btn-sm btn-block" onClick={handleAddToCart}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <Icons.ShoppingCart size={14} /> {t('product.add_to_cart')}
        </button>
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

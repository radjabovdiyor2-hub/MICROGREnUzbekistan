'use client';

import Image from 'next/image';
import {
  CheckCircle, Flame, Heart, Leaf, Minus, Phone, Plus, ShoppingCart, Truck,
  XCircle, Zap,
} from 'lucide-react';
import { StarRow } from './productPageParts';
import type { Review } from './ProductReviews';
import type { Product } from './ProductPageClient';
import { useLang } from '@/components/providers/LangProvider';
import { CONTACT, DELIVERY } from '@/lib/site';

// Верх карточки товара: изображение, цена, наличие, количество и покупка.
// Вкладки и отзывы лежат ниже в общем контейнере, поэтому их отсюда
// вынести нельзя — они делят один div.


interface Props {
  product: Product;
  catIcon: React.ReactNode;
  discount: number;
  fav: boolean;
  quantity: number;
  setQuantity: (n: number) => void;
  added: boolean;
  reviews: Review[];
  fmt: (n: number) => string;
  handleAddToCart: () => void;
  handleBuyNow: () => void;
  handleToggleFav: () => void;
  handleRatingClick: () => void;
}

export function ProductMain({ product, catIcon, discount, fav, quantity, setQuantity, added, reviews, fmt, handleAddToCart, handleBuyNow, handleToggleFav, handleRatingClick }: Props) {
  const { t } = useLang();

  return (
    <>
{/* Main grid */}
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-8)', alignItems: 'start' }}>
  {/* Image */}
  <div className="card" style={{ aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)', color: 'var(--text-muted)', position: 'relative', overflow: 'hidden' }}>
    {discount > 0 && (
      <span style={{ position: 'absolute', top: 12, left: 12, zIndex: 2, padding: '6px 12px', background: 'var(--error)', color: 'white', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-bold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <Flame size={14} /> -{discount}%
      </span>
    )}
    {product.images && product.images.length > 0
      ? <Image src={product.images[0]} alt={product.nameUz} width={600} height={600} style={{ width: '100%', height: '100%', objectFit: 'cover' }} priority quality={80} sizes="(max-width: 768px) 100vw, 50vw" unoptimized={!product.images[0].startsWith('https://') && !product.images[0].startsWith('http://')} />
      : catIcon}
  </div>

  {/* Info */}
  <div>
    {product.brand && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-1)' }}>{product.brand}</div>}
    <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-semibold)', fontSize: 'clamp(1.9rem, 4vw, 2.75rem)', letterSpacing: '-0.03em', lineHeight: 1.08, marginBottom: 'var(--space-3)' }}>
      {t(product.nameUz, product.nameRu)}
    </h1>

    {/* Rating — Amazon pattern: clickable → scrolls to reviews */}
    {product.rating > 0 && (
      <button onClick={handleRatingClick} aria-label={t("Sharhlarga o'tish", "Перейти к отзывам")}
        style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-4)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        <StarRow value={Math.round(product.rating)} readOnly />
        <span style={{ fontWeight: 'var(--font-semibold)', color: 'var(--text-primary)' }}>{product.rating}</span>
        <span style={{ color: 'var(--brand-primary)', fontSize: 'var(--text-sm)', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
          ({product.reviewCount} {t("ta sharh", "отзывов")})
        </span>
      </button>
    )}

    {/* Stock */}
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
      {product.stock > 0 ? (
        product.stock <= 5
          ? <span style={{ color: 'var(--brand-accent)', fontWeight: 'var(--font-bold)', display: 'flex', alignItems: 'center', gap: '4px' }}><Flame size={16} /> {t(`Faqat ${product.stock} dona qoldi — shoshiling!`, `Осталось всего ${product.stock} шт — успейте!`)}</span>
          : <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle size={16} /> {t(`Mavjud (${product.stock} dona)`, `В наличии (${product.stock} шт)`)}</span>
      ) : <span style={{ color: 'var(--error)', display: 'flex', alignItems: 'center', gap: '4px' }}><XCircle size={16} /> {t("Tugagan", "Нет в наличии")}</span>}
    </div>

    {/* Price */}
    <div style={{ marginBottom: 'var(--space-6)' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-3xl)', color: 'var(--brand-primary)' }}>{fmt(product.price)} {t("so'm", "сум")}</div>
      {product.oldPrice && <div style={{ fontSize: 'var(--text-lg)', color: 'var(--text-muted)', textDecoration: 'line-through' }}>{fmt(product.oldPrice)} {t("so'm", "сум")}</div>}
    </div>

    {/* Free delivery */}
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-4)', padding: 'var(--space-2) var(--space-3)', background: 'var(--success-bg)', color: 'var(--success)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)' }}>
      <Truck size={16} /> {t(`${fmt(DELIVERY.freeThreshold)} so'mdan yetkazish BEPUL`, `Доставка БЕСПЛАТНО от ${fmt(DELIVERY.freeThreshold)} сум`)}
    </div>

    {/* Qty + Cart */}
    <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="btn btn-ghost" style={{ width: 44, height: 44, borderRadius: 0 }}><Minus size={16} /></button>
        <span style={{ width: 44, textAlign: 'center', fontWeight: 'var(--font-bold)' }}>{quantity}</span>
        <button onClick={() => setQuantity(quantity + 1)} className="btn btn-ghost" style={{ width: 44, height: 44, borderRadius: 0 }}><Plus size={16} /></button>
      </div>
      <button className="btn btn-lg" onClick={handleAddToCart} disabled={product.stock === 0}
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', border: 'none', color: 'var(--text-inverse)', fontWeight: 'var(--font-bold)', background: added ? 'var(--success)' : 'var(--brand-primary)', transform: added ? 'scale(1.02)' : 'scale(1)', transition: 'transform .25s cubic-bezier(.16,1,.3,1), background .25s ease' }}>
        {added ? <><CheckCircle size={20} /> {t("Savatga qo'shildi", "Добавлено в корзину")}</> : <><ShoppingCart size={20} /> {t("Savatga qo'shish", "В корзину")}</>}
      </button>
    </div>

    {/* Buy Now */}
    <button className="btn btn-accent btn-lg btn-block" onClick={handleBuyNow} disabled={product.stock === 0} id="buy-now-btn"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: 'var(--space-4)', fontWeight: 'var(--font-bold)' }}>
      <Zap size={20} /> {t('Hozir sotib olish', 'Купить сейчас')}
    </button>

    {/* Secondary */}
    <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
      <button onClick={handleToggleFav} className="btn btn-outline" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: fav ? 'var(--error)' : undefined }}>
        {fav ? <Heart fill="currentColor" size={18} /> : <Heart size={18} />} {t("Sevimli", "В избранное")}
      </button>
      <a href={CONTACT.phonePrimaryHref} className="btn btn-outline" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
        <Phone size={18} /> {t("Qo'ng'iroq", "Позвонить")}
      </a>
    </div>

    {/* Trust badges */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)', padding: 'var(--space-3)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
      {[
        { icon: <Leaf size={18} />, title: t('Yangi kesilgan', 'Свежий срез'), sub: t('yetkazish kunida', 'в день доставки'), c: 'var(--success)' },
        { icon: <Truck size={18} />, title: t('Bugun', 'Сегодня'), sub: t('yetkazib beramiz', 'доставим'), c: 'var(--brand-primary)' },
        { icon: <CheckCircle size={18} />, title: t("To'lov", 'Оплата'), sub: 'Click · Payme · Naqd', c: 'var(--brand-accent)' },
      ].map((b, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '4px' }}>
          <span style={{ color: b.c }}>{b.icon}</span>
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', color: 'var(--text-primary)' }}>{b.title}</span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.2 }}>{b.sub}</span>
        </div>
      ))}
    </div>
  </div>
</div>
    </>
  );
}

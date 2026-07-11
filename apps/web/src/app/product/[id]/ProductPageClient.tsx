'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as Icons from '@/components/ui/Icons';
import { useCart } from '@/components/providers/CartProvider';
import { trackViewed } from '@/lib/recentlyViewed';
import { useFavorites } from '@/components/providers/FavoritesProvider';
import { useLang } from '@/components/providers/LangProvider';
import { CONTACT, DELIVERY } from '@/lib/site';
import { ProductCard } from '@/components/shop/ProductCard';
import { FloatingGreenery } from '@/components/ui/FloatingGreenery';

interface Product {
  id: string;
  nameUz: string;
  nameRu: string;
  slug: string;
  descriptionUz: string | null;
  descriptionRu: string | null;
  price: number;
  oldPrice: number | null;
  images: string[];
  stock: number;
  brand: string | null;
  specs: Record<string, string> | null;
  rating: number;
  reviewCount: number;
  category: { id: string; nameUz: string; nameRu: string; slug: string };
}

interface ReviewUser {
  firstName: string | null;
  avatarUrl: string | null;
}

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  user: ReviewUser;
  _optimistic?: boolean;
}

interface RelatedProduct {
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

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'microgreens': <Icons.Leaf size={64} />,
  'baby-leaf': <Icons.Leaf size={64} />,
  'salads': <Icons.Leaf size={64} />,
  'flowers': <Icons.Sparkles size={64} />,
  'seeds': <Icons.Droplet size={64} />,
  'equipment': <Icons.Plug size={64} />,
  'sets': <Icons.Package size={64} />,
};

function getOrCreateGuestId(): string {
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

function StarRow({ value, onChange, readOnly = false }: {
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
            color: s <= active ? '#F59E0B' : 'var(--border)',
            transition: 'color var(--transition-fast)',
            lineHeight: 1,
          }}
          aria-label={`${s} stars`}
        >
          {s <= active
            ? <Icons.StarFilled size={readOnly ? 16 : 24} />
            : <Icons.Star size={readOnly ? 16 : 24} />}
        </button>
      ))}
    </div>
  );
}

function SkeletonProductCard() {
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

export function ProductPageClient({ id }: { id: string }) {
  const { t } = useLang();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('desc');
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const cart = useCart();
  const { toggleFavorite, isFavorite } = useFavorites();

  // Reviews state
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsLoaded, setReviewsLoaded] = useState(false);
  const [ratingForm, setRatingForm] = useState({ name: '', stars: 0, comment: '' });
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [submitError, setSubmitError] = useState('');
  const reviewsAnchorRef = useRef<HTMLDivElement>(null);

  // Cross-sell state
  const [related, setRelated] = useState<RelatedProduct[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);

  useEffect(() => {
    async function fetchProduct() {
      try {
        const res = await fetch(`/api/products?id=${id}`);
        if (res.ok) {
          const data = await res.json();
          setProduct(data);
          if (data?.id) {
            trackViewed({
              id: data.id, nameUz: data.nameUz, nameRu: data.nameRu, slug: data.slug,
              price: data.price, oldPrice: data.oldPrice, images: data.images || [],
              rating: data.rating || 0, reviewCount: data.reviewCount || 0,
              isOnSale: data.isOnSale, category: data.category,
            });
          }
        }
      } catch (err) {
        console.error('Product fetch error:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchProduct();
  }, [id]);

  useEffect(() => {
    if (activeTab !== 'reviews' || reviewsLoaded) return;
    setReviewsLoading(true);
    fetch(`/api/reviews?productId=${id}`)
      .then((r) => r.json())
      .then((data) => { setReviews(data.reviews || []); setReviewsLoaded(true); })
      .catch(() => setReviews([]))
      .finally(() => setReviewsLoading(false));
  }, [activeTab, id, reviewsLoaded]);

  useEffect(() => {
    if (!product) return;
    setRelatedLoading(true);
    fetch(`/api/products?category=${product.category.slug}&limit=5`)
      .then((r) => r.json())
      .then((data) => {
        const items: RelatedProduct[] = (data.items || []).filter((p: RelatedProduct) => p.id !== id).slice(0, 4);
        setRelated(items);
      })
      .catch(() => setRelated([]))
      .finally(() => setRelatedLoading(false));
  }, [product, id]);

  const handleRatingClick = useCallback(() => {
    setActiveTab('reviews');
    setTimeout(() => { reviewsAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
  }, []);

  const handleSubmitReview = async () => {
    if (!product) return;
    if (ratingForm.stars === 0) { setSubmitError(t('Reyting tanlang', 'Выберите оценку')); return; }
    if (!ratingForm.name.trim()) { setSubmitError(t('Ismingizni kiriting', 'Введите ваше имя')); return; }
    setSubmitError('');
    setSubmitState('submitting');
    const optimisticReview: Review = {
      id: `opt-${Date.now()}`,
      rating: ratingForm.stars,
      comment: ratingForm.comment.trim() || null,
      createdAt: new Date().toISOString(),
      user: { firstName: ratingForm.name.trim(), avatarUrl: null },
      _optimistic: true,
    };
    setReviews((prev) => [optimisticReview, ...prev]);
    try {
      const guestId = getOrCreateGuestId();
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestId, guestName: ratingForm.name.trim(),
          productId: product.id, rating: ratingForm.stars,
          comment: ratingForm.comment.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setReviews((prev) => prev.map((r) => r.id === optimisticReview.id ? { ...optimisticReview, id: data.review.id, _optimistic: false } : r));
        setSubmitState('done');
        setRatingForm({ name: '', stars: 0, comment: '' });
        setProduct((p) => p ? { ...p, reviewCount: p.reviewCount + 1 } : p);
      } else { throw new Error(data.error); }
    } catch {
      setReviews((prev) => prev.filter((r) => r.id !== optimisticReview.id));
      setSubmitState('error');
      setSubmitError(t("Xatolik yuz berdi. Qayta urinib ko'ring.", 'Произошла ошибка. Попробуйте ещё раз.'));
    }
  };

  function getRatingDistribution(revs: Review[]) {
    const counts = [0, 0, 0, 0, 0];
    revs.forEach((r) => { if (r.rating >= 1 && r.rating <= 5) counts[r.rating - 1]++; });
    return counts;
  }

  const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

  if (loading) {
    return (
      <div className="container" style={{ paddingTop: 'var(--space-8)', textAlign: 'center' }}>
        <Icons.Clock size={48} style={{ color: 'var(--text-muted)', animation: 'pulse 1.5s infinite' }} />
        <p style={{ color: 'var(--text-muted)', marginTop: 'var(--space-4)' }}>{t("Yuklanmoqda...", "Загрузка...")}</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container" style={{ paddingTop: 'var(--space-12)', textAlign: 'center' }}>
        <Icons.Folder size={64} style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }} />
        <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-2)' }}>{t("Mahsulot topilmadi", "Товар не найден")}</h2>
        <Link href="/catalog" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <Icons.ArrowLeft size={16} /> {t("Katalogga qaytish", "Вернуться в каталог")}
        </Link>
      </div>
    );
  }

  const discount = product.oldPrice ? Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100) : 0;
  const catIcon = CATEGORY_ICONS[product.category?.slug] || <Icons.Package size={64} />;
  const fav = isFavorite(product.id);

  const handleAddToCart = () => {
    cart.addItem({ id: product.id, nameUz: product.nameUz, nameRu: product.nameRu, price: product.price, oldPrice: product.oldPrice, slug: product.slug, images: product.images, category: product.category }, quantity);
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };

  const handleBuyNow = () => {
    cart.addItem({ id: product!.id, nameUz: product!.nameUz, nameRu: product!.nameRu, price: product!.price, oldPrice: product!.oldPrice, slug: product!.slug, images: product!.images, category: product!.category }, quantity);
    router.push('/cart');
  };

  const handleToggleFav = () => {
    toggleFavorite({ id: product.id, nameUz: product.nameUz, nameRu: product.nameRu, price: product.price, oldPrice: product.oldPrice, slug: product.slug, images: product.images, rating: product.rating, category: product.category });
  };

  const TABS = [
    { id: 'desc',     labelUz: "Tavsif",      labelRu: "Описание",       icon: <Icons.FileText size={14} /> },
    { id: 'specs',    labelUz: "Xususiyatlar", labelRu: "Характеристики", icon: <Icons.ClipboardList size={14} /> },
    { id: 'delivery', labelUz: "Yetkazish",    labelRu: "Доставка",       icon: <Icons.Truck size={14} /> },
    { id: 'reviews',  labelUz: "Sharhlar",     labelRu: "Отзывы",         icon: <Icons.MessageSquare size={14} /> },
  ];

  return (
    <div style={{ position: 'relative' }}>
      {/* Ambient canvas: floating microgreens + salad leaves */}
      <FloatingGreenery count={10} style={{
        position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 0,
      }} />
      <div className="container" style={{ position: 'relative', zIndex: 1, paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-8)' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
        <Link href="/" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Icons.Home size={14} /> {t("Bosh sahifa", "Главная")}
        </Link>
        <Icons.ChevronRight size={14} />
        <Link href="/catalog" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>{t("Katalog", "Каталог")}</Link>
        <Icons.ChevronRight size={14} />
        <span style={{ color: 'var(--text-primary)' }}>{t(product.nameUz, product.nameRu)}</span>
      </div>

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-8)', alignItems: 'start' }}>
        {/* Image */}
        <div className="card" style={{ aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)', color: 'var(--text-muted)', position: 'relative', overflow: 'hidden' }}>
          {discount > 0 && (
            <span style={{ position: 'absolute', top: 12, left: 12, zIndex: 2, padding: '6px 12px', background: 'var(--error)', color: 'white', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-bold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Icons.Flame size={14} /> -{discount}%
            </span>
          )}
          {product.images && product.images.length > 0
            ? <Image src={product.images[0]} alt={product.nameUz} width={600} height={600} style={{ width: '100%', height: '100%', objectFit: 'cover' }} priority quality={80} sizes="(max-width: 768px) 100vw, 50vw" unoptimized={!product.images[0].startsWith('https://') && !product.images[0].startsWith('http://')} />
            : catIcon}
        </div>

        {/* Info */}
        <div>
          {product.brand && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-1)' }}>{product.brand}</div>}
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-3)' }}>
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
                ? <span style={{ color: 'var(--brand-accent)', fontWeight: 'var(--font-bold)', display: 'flex', alignItems: 'center', gap: '4px' }}><Icons.Flame size={16} /> {t(`Faqat ${product.stock} dona qoldi — shoshiling!`, `Осталось всего ${product.stock} шт — успейте!`)}</span>
                : <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}><Icons.CheckCircle size={16} /> {t(`Mavjud (${product.stock} dona)`, `В наличии (${product.stock} шт)`)}</span>
            ) : <span style={{ color: 'var(--error)', display: 'flex', alignItems: 'center', gap: '4px' }}><Icons.XCircle size={16} /> {t("Tugagan", "Нет в наличии")}</span>}
          </div>

          {/* Price */}
          <div style={{ marginBottom: 'var(--space-6)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-3xl)', color: 'var(--brand-primary)' }}>{fmt(product.price)} {t("so'm", "сум")}</div>
            {product.oldPrice && <div style={{ fontSize: 'var(--text-lg)', color: 'var(--text-muted)', textDecoration: 'line-through' }}>{fmt(product.oldPrice)} {t("so'm", "сум")}</div>}
          </div>

          {/* Free delivery */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-4)', padding: 'var(--space-2) var(--space-3)', background: 'var(--success-bg)', color: 'var(--success)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)' }}>
            <Icons.Truck size={16} /> {t(`${fmt(DELIVERY.freeThreshold)} so'mdan yetkazish BEPUL`, `Доставка БЕСПЛАТНО от ${fmt(DELIVERY.freeThreshold)} сум`)}
          </div>

          {/* Qty + Cart */}
          <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="btn btn-ghost" style={{ width: 44, height: 44, borderRadius: 0 }}><Icons.Minus size={16} /></button>
              <span style={{ width: 44, textAlign: 'center', fontWeight: 'var(--font-bold)' }}>{quantity}</span>
              <button onClick={() => setQuantity(quantity + 1)} className="btn btn-ghost" style={{ width: 44, height: 44, borderRadius: 0 }}><Icons.Plus size={16} /></button>
            </div>
            <button className="btn btn-lg" onClick={handleAddToCart} disabled={product.stock === 0}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', border: 'none', color: '#fff', fontWeight: 'var(--font-bold)', background: added ? 'var(--success)' : 'var(--brand-primary)', transform: added ? 'scale(1.02)' : 'scale(1)', transition: 'transform .25s cubic-bezier(.16,1,.3,1), background .25s ease' }}>
              {added ? <><Icons.CheckCircle size={20} /> {t("Savatga qo'shildi", "Добавлено в корзину")}</> : <><Icons.ShoppingCart size={20} /> {t("Savatga qo'shish", "В корзину")}</>}
            </button>
          </div>

          {/* Buy Now */}
          <button className="btn btn-accent btn-lg btn-block ripple" onClick={handleBuyNow} disabled={product.stock === 0} id="buy-now-btn"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: 'var(--space-4)', fontWeight: 'var(--font-bold)' }}>
            <Icons.Zap size={20} /> {t('Hozir sotib olish', 'Купить сейчас')}
          </button>

          {/* Secondary */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
            <button onClick={handleToggleFav} className="btn btn-outline" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: fav ? 'var(--error)' : undefined }}>
              {fav ? <Icons.HeartFilled size={18} /> : <Icons.Heart size={18} />} {t("Sevimli", "В избранное")}
            </button>
            <a href={CONTACT.phonePrimaryHref} className="btn btn-outline" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <Icons.Phone size={18} /> {t("Qo'ng'iroq", "Позвонить")}
            </a>
          </div>

          {/* Trust badges */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)', padding: 'var(--space-3)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            {[
              { icon: <Icons.Leaf size={18} />, title: t('Yangi kesilgan', 'Свежий срез'), sub: t('yetkazish kunida', 'в день доставки'), c: 'var(--success)' },
              { icon: <Icons.Truck size={18} />, title: t('Bugun', 'Сегодня'), sub: t('yetkazib beramiz', 'доставим'), c: 'var(--brand-primary)' },
              { icon: <Icons.CheckCircle size={18} />, title: t("To'lov", 'Оплата'), sub: 'Click · Payme · Naqd', c: 'var(--brand-accent)' },
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

      {/* Tabs */}
      <div ref={reviewsAnchorRef} style={{ marginTop: 'var(--space-8)' }} id="reviews-tab-anchor">
        <div style={{ display: 'flex', gap: 'var(--space-2)', borderBottom: '2px solid var(--border)', marginBottom: 'var(--space-4)', overflowX: 'auto' }}>
        {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                flexShrink: 0, padding: 'var(--space-3) var(--space-4)',
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontWeight: activeTab === tab.id ? 'var(--font-bold)' : 'var(--font-medium)',
                fontSize: 'var(--text-sm)',
                color: activeTab === tab.id ? 'var(--brand-primary)' : 'var(--text-secondary)',
                borderBottom: activeTab === tab.id ? '3px solid var(--brand-primary)' : '3px solid transparent',
                marginBottom: '-2px', transition: 'all var(--transition-fast)',
              }}>
              {tab.icon} {t(tab.labelUz, tab.labelRu)}
              {tab.id === 'reviews' && product.reviewCount > 0 && (
                <span style={{ background: activeTab === 'reviews' ? 'rgba(255,255,255,0.25)' : 'var(--bg-tertiary)', borderRadius: 'var(--radius-full)', fontSize: '11px', padding: '0 6px', fontWeight: 'var(--font-bold)' }}>
                  {product.reviewCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'desc' && (
          <div className="card" style={{ padding: 'var(--space-6)' }}>
            <p style={{ lineHeight: 1.8 }}>{t(product.descriptionUz || "Bu mahsulot haqida batafsil ma'lumot tez orada qo'shiladi.", product.descriptionRu || "Подробная информация об этом товаре будет добавлена в ближайшее время.")}</p>
          </div>
        )}

        {activeTab === 'specs' && (
          <div className="card" style={{ padding: 'var(--space-6)' }}>
            {product.specs ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {Object.entries(product.specs).map(([key, val]) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}><Icons.CheckCircle size={14} style={{ color: 'var(--success)' }} /> {key}</span>
                    <span style={{ fontWeight: 'var(--font-semibold)' }}>{val}</span>
                  </div>
                ))}
              </div>
            ) : <p style={{ color: 'var(--text-muted)' }}>{t("Xususiyatlar tez orada qo'shiladi", "Характеристики будут добавлены в ближайшее время")}</p>}
          </div>
        )}

        {activeTab === 'delivery' && (
          <div className="card" style={{ padding: 'var(--space-6)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {[
                { icon: <Icons.Truck size={24} />, title: t("Yetkazib berish", "Доставка"), sub: t("30-90 daqiqada · 25 000 so'm (500K dan bepul)", "За 30-90 минут · 25 000 сум (от 500К бесплатно)") },
                { icon: <Icons.MapPin size={24} />, title: t("O'zingiz olib ketish", "Самовывоз"), sub: t("Ray senter, Hokimiyat yonida", "Райцентр, возле Хокимията") },
                { icon: <Icons.Phone size={24} />, title: t("Maslahat", "Консультация"), sub: '+998 94 999 95 99' },
              ].map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <span style={{ color: 'var(--brand-primary)', flexShrink: 0 }}>{d.icon}</span>
                  <div><div style={{ fontWeight: 'var(--font-semibold)' }}>{d.title}</div><div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{d.sub}</div></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reviews tab */}
        {activeTab === 'reviews' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

            {/* Rating summary */}
            {(reviews.length > 0 || product.reviewCount > 0) && (
              <div className="card" style={{ padding: 'var(--space-6)' }}>
                <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: 'clamp(3rem,8vw,4rem)', color: 'var(--brand-primary)', lineHeight: 1 }}>{product.rating.toFixed(1)}</div>
                    <StarRow value={Math.round(product.rating)} readOnly />
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>{product.reviewCount} {t("ta sharh", "отзывов")}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[5, 4, 3, 2, 1].map((star) => {
                      const dist = getRatingDistribution(reviews);
                      const count = dist[star - 1];
                      const pct = reviews.length > 0 ? Math.round((count / reviews.length) * 100) : 0;
                      return (
                        <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', width: 16, textAlign: 'right' }}>{star}</span>
                          <Icons.StarFilled size={12} style={{ color: '#F59E0B', flexShrink: 0 }} />
                          <div style={{ flex: 1, height: 8, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: star >= 4 ? 'var(--success)' : star === 3 ? 'var(--warning)' : 'var(--error)', borderRadius: 4, transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)' }} />
                          </div>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', width: 28, textAlign: 'right' }}>{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Reviews list — shown FIRST so user can read before writing */}
            {reviewsLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="card" style={{ padding: 'var(--space-4)' }}>
                    <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                      <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0 }} />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div className="skeleton" style={{ height: 14, width: '40%' }} />
                        <div className="skeleton" style={{ height: 12, width: '30%' }} />
                      </div>
                    </div>
                    <div className="skeleton" style={{ height: 14, width: '100%', marginBottom: 4 }} />
                    <div className="skeleton" style={{ height: 14, width: '80%' }} />
                  </div>
                ))}
              </div>
            ) : reviews.length === 0 ? (
              <div className="card" style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Icons.MessageSquare size={48} style={{ marginBottom: 'var(--space-3)', opacity: 0.4 }} />
                <p>{t("Hali sharhlar yo'q. Birinchi bo'lib fikr qoldiring!", "Отзывов пока нет. Будьте первым!")}</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {reviews.map((review) => (
                  <div key={review.id} className="card" style={{ padding: 'var(--space-4)', opacity: review._optimistic ? 0.75 : 1, transition: 'opacity 0.3s ease' }}>
                    <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, background: 'var(--brand-primary-light)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'var(--font-bold)', fontSize: 'var(--text-base)', overflow: 'hidden' }}>
                        {review.user.avatarUrl
                          ? <Image src={review.user.avatarUrl} alt="" width={40} height={40} style={{ width: '100%', height: '100%', objectFit: 'cover' }} unoptimized />
                          : (review.user.firstName?.[0] || '?').toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)' }}>{review.user.firstName || t("Anonim", "Аноним")}</span>
                            {review._optimistic && <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 'var(--radius-full)' }}>{t("Saqlanmoqda...", "Сохраняется...")}</span>}
                          </div>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{new Date(review.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                        </div>
                        <StarRow value={review.rating} readOnly />
                        {review.comment && <p style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.7 }}>{review.comment}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Submit form — BELOW the list (Amazon / WB order) */}
            <div className="card" style={{ padding: 'var(--space-6)' }}>
              <h3 style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-lg)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icons.MessageSquare size={20} style={{ color: 'var(--brand-primary)' }} />
                {t("Sharh qoldiring", "Оставить отзыв")}
              </h3>
              {submitState === 'done' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: 'var(--space-4)', background: 'var(--success-bg)', borderRadius: 'var(--radius-md)', color: 'var(--success)', fontWeight: 'var(--font-medium)' }}>
                  <Icons.CheckCircle size={20} /> {t("Sharh muvaffaqiyatli qo'shildi!", "Отзыв успешно добавлен!")}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', marginBottom: 'var(--space-1)', color: 'var(--text-primary)' }}>{t("Ismingiz *", "Ваше имя *")}</label>
                    <input type="text" value={ratingForm.name} onChange={(e) => setRatingForm((p) => ({ ...p, name: e.target.value }))} placeholder={t("Ismingizni kiriting", "Введите ваше имя")} id="review-name"
                      style={{ width: '100%', padding: 'var(--space-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)', outline: 'none' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', marginBottom: 'var(--space-2)', color: 'var(--text-primary)' }}>{t("Baho *", "Оценка *")}</label>
                    <StarRow value={ratingForm.stars} onChange={(v) => setRatingForm((p) => ({ ...p, stars: v }))} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', marginBottom: 'var(--space-1)', color: 'var(--text-primary)' }}>{t("Izoh (ixtiyoriy)", "Комментарий (необязательно)")}</label>
                    <textarea value={ratingForm.comment} onChange={(e) => setRatingForm((p) => ({ ...p, comment: e.target.value }))} placeholder={t("Mahsulot haqida fikringizni yozing...", "Напишите ваш отзыв о товаре...")} rows={3} id="review-comment"
                      style={{ width: '100%', padding: 'var(--space-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)', outline: 'none', resize: 'vertical', fontFamily: 'var(--font-body)' }} />
                  </div>
                  {submitError && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: 'var(--space-3)', background: 'var(--error-bg)', borderRadius: 'var(--radius-md)', color: 'var(--error)', fontSize: 'var(--text-sm)' }}>
                      <Icons.AlertTriangle size={16} /> {submitError}
                    </div>
                  )}
                  <button className="btn btn-primary" onClick={handleSubmitReview} disabled={submitState === 'submitting'} id="submit-review-btn"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', opacity: submitState === 'submitting' ? 0.6 : 1 }}>
                    {submitState === 'submitting' ? <><Icons.Clock size={16} /> {t("Yuborilmoqda...", "Отправка...")}</> : <><Icons.Send size={16} /> {t("Sharh yuborish", "Отправить отзыв")}</>}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      </div>
      {/* end .container */}

      {/* Cross-sell */}
      {(relatedLoading || related.length > 0) && (
        <div className="container" style={{ position: 'relative', zIndex: 1, marginTop: 'var(--space-10)', paddingBottom: 'var(--space-8)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', fontSize: 'var(--text-xl)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Icons.ShoppingCart size={22} style={{ color: 'var(--brand-primary)' }} />
            {t("Bu bilan birga olishadi", "С этим часто берут")}
          </h2>
          <div className="product-grid">
            {relatedLoading
              ? [1, 2, 3, 4].map((i) => <SkeletonProductCard key={i} />)
              : related.map((p) => <ProductCard key={p.id} product={p} />)
            }
          </div>
        </div>
      )}
    </div>
  );
}
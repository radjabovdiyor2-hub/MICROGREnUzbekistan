'use client';

import { ProductMain } from './ProductMain';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, ChevronRight, Clock, Folder, Home, Package, ShoppingCart,
} from 'lucide-react';
import { useCart } from '@/components/providers/CartProvider';
import { trackViewed } from '@/lib/recentlyViewed';
import { useFavorites } from '@/components/providers/FavoritesProvider';
import { useLang } from '@/components/providers/LangProvider';
import { ProductCard } from '@/components/shop/ProductCard';
import { CATEGORY_ICONS, getOrCreateGuestId, SkeletonProductCard } from './productPageParts';
import { ProductReviews, type Review } from './ProductReviews';
import { ProductPageTabs } from './ProductPageTabs';

export interface Product {
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

  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsLoaded, setReviewsLoaded] = useState(false);
  const [ratingForm, setRatingForm] = useState({ name: '', stars: 0, comment: '' });
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [submitError, setSubmitError] = useState('');
  const reviewsAnchorRef = useRef<HTMLDivElement>(null);

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

  const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

  if (loading) {
    return (
      <div className="container" style={{ paddingTop: 'var(--space-8)', textAlign: 'center' }}>
        <Clock size={48} style={{ color: 'var(--text-muted)', animation: 'pulse 1.5s infinite' }} />
        <p style={{ color: 'var(--text-muted)', marginTop: 'var(--space-4)' }}>{t("Yuklanmoqda...", "Загрузка...")}</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container" style={{ paddingTop: 'var(--space-12)', textAlign: 'center' }}>
        <Folder size={64} style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }} />
        <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-2)' }}>{t("Mahsulot topilmadi", "Товар не найден")}</h2>
        <Link href="/catalog" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <ArrowLeft size={16} /> {t("Katalogga qaytish", "Вернуться в каталог")}
        </Link>
      </div>
    );
  }

  const discount = product.oldPrice ? Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100) : 0;
  const catIcon = CATEGORY_ICONS[product.category?.slug] || <Package size={64} />;
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

  return (
    <div style={{ position: 'relative' }}>
      <div className="container" style={{ position: 'relative', zIndex: 1, paddingTop: 'var(--space-8)', paddingBottom: 'var(--space-8)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          <Link href="/" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Home size={14} /> {t("Bosh sahifa", "Главная")}
          </Link>
          <ChevronRight size={14} />
          <Link href="/catalog" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>{t("Katalog", "Каталог")}</Link>
          <ChevronRight size={14} />
          <span style={{ color: 'var(--text-primary)' }}>{t(product.nameUz, product.nameRu)}</span>
        </div>

        <ProductMain
          product={product}
          catIcon={catIcon}
          discount={discount}
          fav={fav}
          quantity={quantity}
          setQuantity={setQuantity}
          added={added}
          fmt={fmt}
          handleAddToCart={handleAddToCart}
          handleBuyNow={handleBuyNow}
          handleToggleFav={handleToggleFav}
          handleRatingClick={handleRatingClick}
        />

        <div ref={reviewsAnchorRef} style={{ marginTop: 'var(--space-8)' }} id="reviews-tab-anchor">
          <ProductPageTabs
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            product={product}
            t={t}
          />

          <ProductReviews
            activeTab={activeTab}
            product={product}
            reviews={reviews}
            reviewsLoading={reviewsLoading}
            ratingForm={ratingForm}
            setRatingForm={setRatingForm}
            submitState={submitState}
            submitError={submitError}
            handleSubmitReview={handleSubmitReview}
          />
        </div>
      </div>

      {(relatedLoading || related.length > 0) && (
        <div className="container" style={{ position: 'relative', zIndex: 1, marginTop: 'var(--space-10)', paddingBottom: 'var(--space-8)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', fontSize: 'var(--text-xl)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShoppingCart size={22} style={{ color: 'var(--brand-primary)' }} />
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

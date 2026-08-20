'use client';

import { ProductMain } from './ProductMain';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronRight, Clock, Folder, Home, Package } from 'lucide-react';
import { useCart } from '@/components/providers/CartProvider';
import { trackViewed } from '@/lib/recentlyViewed';
import { useFavorites } from '@/components/providers/FavoritesProvider';
import { useLang } from '@/components/providers/LangProvider';
import { CATEGORY_ICONS } from './productPageParts';
import { ProductReviews } from './ProductReviews';
import { ProductPageTabs } from './ProductPageTabs';
import { useProductReviews } from './useProductReviews';
import { ProductCrossSell, type RelatedProduct } from './ProductCrossSell';

import { type Product } from './productDetailTypes';
export type { Product };

/** Карточка → запись в «недавно просмотренные». Форма одна на оба пути. */
function toViewed(p: Product) {
  return {
    id: p.id, nameUz: p.nameUz, nameRu: p.nameRu, slug: p.slug,
    price: p.price, oldPrice: p.oldPrice, images: p.images || [],
    rating: p.rating || 0, reviewCount: p.reviewCount || 0,
    isOnSale: Boolean(p.isOnSale), category: p.category,
  };
}

export function ProductPageClient({ id, initialProduct = null }: { id: string; initialProduct?: Product | null }) {
  const { t } = useLang();
  const router = useRouter();
  // Товар приезжает с сервера пропсом — он там уже запрошен ради JSON-LD.
  // Пустым он остаётся, только если база была недоступна при рендере; тогда
  // ниже отрабатывает прежний запрос с браузера.
  const [product, setProduct] = useState<Product | null>(initialProduct);
  const [loading, setLoading] = useState(!initialProduct);
  const [activeTab, setActiveTab] = useState('desc');
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const cart = useCart();
  const { toggleFavorite, isFavorite } = useFavorites();

  const {
    reviews, reviewsLoading, ratingForm, setRatingForm, submitState, submitError,
    reviewsAnchorRef, handleRatingClick, handleSubmitReview,
  } = useProductReviews({
    productId: id,
    activeTab,
    setActiveTab,
    t,
    onReviewAdded: () => setProduct((p) => (p ? { ...p, reviewCount: p.reviewCount + 1 } : p)),
  });

  const [related, setRelated] = useState<RelatedProduct[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);

  useEffect(() => {
    // «Недавно просмотренные» — это localStorage, и писать в него можно
    // только из браузера. Товар при этом уже здесь, ходить за ним не нужно.
    if (initialProduct) {
      Promise.resolve().then(() => trackViewed(toViewed(initialProduct)));
      return;
    }

    // Запасной путь: сервер не смог отдать карточку (база была недоступна
    // при рендере). Раньше этот запрос уходил ВСЕГДА — полный круг до
    // сервера уже после того, как страница отрисовалась.
    async function fetchProduct() {
      try {
        const res = await fetch(`/api/products?id=${id}`);
        if (res.ok) {
          const data = await res.json();
          setProduct(data);
          if (data?.id) trackViewed(toViewed(data));
        }
      } catch (err) {
        console.error('Product fetch error:', err);
      } finally {
        setLoading(false);
      }
    }
    Promise.resolve().then(() => fetchProduct());
  }, [id, initialProduct]);

  useEffect(() => {
    if (!product) return;
    Promise.resolve().then(() => {
      setRelatedLoading(true);
      fetch(`/api/products?category=${product.category.slug}&limit=5`)
        .then((r) => r.json())
        .then((data) => {
          const items: RelatedProduct[] = (data.items || []).filter((p: RelatedProduct) => p.id !== id).slice(0, 4);
          setRelated(items);
        })
        .catch(() => setRelated([]))
        .finally(() => setRelatedLoading(false));
    });
  }, [product, id]);

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
    cart.addItem({ id: product.id, nameUz: product.nameUz, nameRu: product.nameRu, price: product.price, oldPrice: product.oldPrice, unit: product.unit, slug: product.slug, images: product.images, category: product.category }, quantity);
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };

  const handleBuyNow = () => {
    cart.addItem({ id: product!.id, nameUz: product!.nameUz, nameRu: product!.nameRu, price: product!.price, oldPrice: product!.oldPrice, unit: product!.unit, slug: product!.slug, images: product!.images, category: product!.category }, quantity);
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

      <ProductCrossSell related={related} relatedLoading={relatedLoading} t={t} />
    </div>
  );
}

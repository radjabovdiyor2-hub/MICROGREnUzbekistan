'use client';

import { ProductMain } from './ProductMain';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, CheckCircle, ChevronRight, ClipboardList, Clock, FileText, Flame, Folder, Home, Leaf, MapPin, MessageSquare, Package, Phone, ShoppingCart, Sparkles, Truck,
} from 'lucide-react';
import { useCart } from '@/components/providers/CartProvider';
import { trackViewed } from '@/lib/recentlyViewed';
import { useFavorites } from '@/components/providers/FavoritesProvider';
import { useLang } from '@/components/providers/LangProvider';
import { ProductCard } from '@/components/shop/ProductCard';

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

import { CATEGORY_ICONS, getOrCreateGuestId, SkeletonProductCard } from './productPageParts';
import { ProductReviews, type Review } from './ProductReviews';

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

  const TABS = [
    { id: 'desc',     labelUz: "Tavsif",      labelRu: "Описание",       icon: <FileText size={14} /> },
    { id: 'specs',    labelUz: "Xususiyatlar", labelRu: "Характеристики", icon: <ClipboardList size={14} /> },
    { id: 'delivery', labelUz: "Yetkazish",    labelRu: "Доставка",       icon: <Truck size={14} /> },
    { id: 'reviews',  labelUz: "Sharhlar",     labelRu: "Отзывы",         icon: <MessageSquare size={14} /> },
  ];

  return (
    <div style={{ position: 'relative' }}>
      <div className="container" style={{ position: 'relative', zIndex: 1, paddingTop: 'var(--space-8)', paddingBottom: 'var(--space-8)' }}>
      {/* Breadcrumb */}
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
        reviews={reviews}
        fmt={fmt}
        handleAddToCart={handleAddToCart}
        handleBuyNow={handleBuyNow}
        handleToggleFav={handleToggleFav}
        handleRatingClick={handleRatingClick}
      />
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
                <span style={{ background: activeTab === 'reviews' ? 'color-mix(in srgb, var(--brand-primary) 14%, transparent)' : 'var(--bg-tertiary)', borderRadius: 'var(--radius-full)', fontSize: '11px', padding: '0 6px', fontWeight: 'var(--font-bold)' }}>
                  {product.reviewCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'desc' && (
          <div className="card" style={{ padding: 'var(--space-6)' }}>
            <p style={{ lineHeight: 1.8, fontSize: 'var(--text-base)', marginBottom: 'var(--space-4)' }}>
              {t(
                product.descriptionUz || `${product.nameUz} — ekologik toza substratda o'stirilgan, 100% tabiiy va vitaminlarga boy mahsulot. Tarkibida yuqori konsentratsiyali antiosidantlar va minerallar mavjud.`,
                product.descriptionRu || `${product.nameRu} — 100% натуральный свежий продукт, выращенный на экологически чистом субстрате. Содержит высокую концентрацию антиоксидантов, витаминов и микроэлементов.`
              )}
            </p>
            {/* Health & Benefit Badges */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: 'var(--space-4)' }}>
              <span style={{ padding: '6px 12px', background: 'var(--success-bg)', color: 'var(--success)', borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Sparkles size={12} /> {t("100% Ekologik toza", "100% Эко продукт")}
              </span>
              <span style={{ padding: '6px 12px', background: 'color-mix(in srgb, var(--cat-1) 12%, transparent)', color: 'var(--cat-1)', borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Leaf size={12} /> {t("Vitaminlar: A, C, E, K, B-complex", "Витамины: A, C, E, K, B-комплекс")}
              </span>
              <span style={{ padding: '6px 12px', background: 'var(--warning-bg)', color: 'var(--warning)', borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Flame size={12} /> {t("Antioksidant & Detox", "Антиоксидант и Детокс")}
              </span>
            </div>
          </div>
        )}

        {activeTab === 'specs' && (
          <div className="card" style={{ padding: 'var(--space-6)' }}>
            {(() => {
              const mergedSpecs: Record<string, string> = product.specs && Object.keys(product.specs).length > 0
                ? product.specs
                : product.category?.slug === 'microgreens'
                ? {
                    [t("O'sish vaqti", "Срок выращивания")]: t("7-10 kun", "7-10 дней"),
                    [t("Vitaminlar", "Витамины")]: "A, B, C, E, K, Sulforaphane",
                    [t("Minerallar", "Минералы")]: t("Temir, Magniy, Kaltsiy, Rux", "Железо, Магний, Кальций, Цинк"),
                    [t("Ta'm", "Вкус")]: t("Yangi va sersuv", "Свежий и сочный"),
                    [t("Foydali xususiyati", "Полезные свойства")]: t("Immunitet va hazm qilish", "Иммунитет и детоксикация"),
                    [t("Saqlash harorati", "Температура хранения")]: "2°C — 5°C",
                    [t("Yaroqlilik muddati", "Срок годности")]: t("7 kun", "7 дней")
                  }
                : product.category?.slug === 'seeds'
                ? {
                    [t("Unuvchanligi", "Всхожесть")]: "98%",
                    [t("Tozaligi", "Чистота")]: "99.5%",
                    [t("Vazni", "Вес")]: t("50g — 200g paket", "50г — 200г пачка"),
                    [t("Saqlash muddati", "Срок годности")]: t("24 oy", "24 месяца")
                  }
                : {
                    [t("Kafolat", "Гарантия")]: t("Sifat kafolati 100%", "Гарантия качества 100%"),
                    [t("Ishlab chiqaruvchi", "Производитель")]: "Microgreen Uzbekistan",
                    [t("Yetkazib berish", "Доставка")]: t("Bugunning o'zida", "В день заказа")
                  };

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {Object.entries(mergedSpecs).map(([key, val]) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-3) 0', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-sm)' }}>
                      <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CheckCircle size={15} style={{ color: 'var(--success)' }} /> {key}
                      </span>
                      <span style={{ fontWeight: 'var(--font-semibold)', color: 'var(--text-primary)' }}>{val}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {activeTab === 'delivery' && (
          <div className="card" style={{ padding: 'var(--space-6)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {[
                { icon: <Truck size={24} />, title: t("Yetkazib berish", "Доставка"), sub: t("30-90 daqiqada · 25 000 so'm (500K dan bepul)", "За 30-90 минут · 25 000 сум (от 500К бесплатно)") },
                { icon: <MapPin size={24} />, title: t("O'zingiz olib ketish", "Самовывоз"), sub: t("Ray senter, Hokimiyat yonida", "Райцентр, возле Хокимията") },
                { icon: <Phone size={24} />, title: t("Maslahat", "Консультация"), sub: '+998 94 999 95 99' },
              ].map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <span style={{ color: 'var(--brand-primary)', flexShrink: 0 }}>{d.icon}</span>
                  <div><div style={{ fontWeight: 'var(--font-semibold)' }}>{d.title}</div><div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{d.sub}</div></div>
                </div>
              ))}
            </div>
          </div>
        )}

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
      {/* end .container */}

      {/* Cross-sell */}
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

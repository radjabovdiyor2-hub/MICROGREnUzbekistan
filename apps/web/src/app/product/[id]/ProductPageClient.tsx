'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, CheckCircle, ChevronRight, ClipboardList, Clock, FileText, Flame, Folder, Heart, Home, Leaf, MapPin, MessageSquare, Minus, Package, Phone, Plus, ShoppingCart, Sparkles, Truck, XCircle, Zap,
} from 'lucide-react';
import { useCart } from '@/components/providers/CartProvider';
import { trackViewed } from '@/lib/recentlyViewed';
import { useFavorites } from '@/components/providers/FavoritesProvider';
import { useLang } from '@/components/providers/LangProvider';
import { CONTACT, DELIVERY } from '@/lib/site';
import { ProductCard } from '@/components/shop/ProductCard';

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

import {
  CATEGORY_ICONS, getOrCreateGuestId, SkeletonProductCard, StarRow,
} from './productPageParts';
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

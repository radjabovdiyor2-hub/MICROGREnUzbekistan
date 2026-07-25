'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ProductCard } from '@/components/shop/ProductCard';
import {
  AlertTriangle, Clock, Droplet, Leaf, Package, Plug, Plus, RefreshCw, Search, Sparkles,
} from 'lucide-react';
import { useLang } from '@/components/providers/LangProvider';
import { motion } from 'framer-motion';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { FloatingGreenery } from '@/components/ui/FloatingGreenery';

const PAGE_SIZE = 24;

const CATEGORIES = [
  { slug: '', nameUz: 'Barchasi', nameRu: 'Все', icon: <Package size={18} /> },
  { slug: 'microgreens', nameUz: "Mikroko'katlar", nameRu: 'Микрозелень', icon: <Leaf size={18} /> },
  { slug: 'baby-leaf', nameUz: 'Baby Leaf', nameRu: 'Бейби лист', icon: <Leaf size={18} /> },
  { slug: 'salads', nameUz: 'Salatlar', nameRu: 'Салаты', icon: <Leaf size={18} /> },
  { slug: 'flowers', nameUz: 'Gullar', nameRu: 'Цветы', icon: <Sparkles size={18} /> },
  { slug: 'seeds', nameUz: "Urug'lar", nameRu: 'Семена', icon: <Droplet size={18} /> },
  { slug: 'equipment', nameUz: 'Uskunalar', nameRu: 'Оборудование', icon: <Plug size={18} /> },
  { slug: 'sets', nameUz: "To'plamlar", nameRu: 'Наборы', icon: <Package size={18} /> },
];

const SORT_OPTIONS = [
  { value: 'featured', labelUz: "Tavsiya etilgan", labelRu: "Рекомендуемые" },
  { value: 'price_asc', labelUz: "Arzon → Qimmat", labelRu: "Дешевле → Дороже" },
  { value: 'price_desc', labelUz: "Qimmat → Arzon", labelRu: "Дороже → Дешевле" },
  { value: 'rating', labelUz: "Reyting bo'yicha", labelRu: "По рейтингу" },
  { value: 'newest', labelUz: "Eng yangi", labelRu: "Новинки" },
];

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

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function CatalogContent({ initialCategory = '' }: { initialCategory?: string }) {
  const { t } = useLang();
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  // initialCategory приходит с категорийного лендинга /catalog/<slug>, где
  // категория закодирована в пути, а не в query.
  const [activeCategory, setActiveCategory] = useState(searchParams.get('category') || initialCategory);
  const [sort, setSort] = useState('featured');
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [pagination, setPagination] = useState<Pagination | null>(null);

  const fetchProducts = useCallback(async (page = 1, append = false) => {
    if (page === 1) setLoading(true);
    else setLoadingMore(true);
    setError(false);

    try {
      const params = new URLSearchParams();
      if (activeCategory) params.set('category', activeCategory);
      params.set('sort', sort);
      params.set('limit', String(PAGE_SIZE));
      params.set('page', String(page));
      if (search) params.set('search', search);

      const res = await fetch(`/api/products?${params}`);
      const data = await res.json();

      if (append) {
        setProducts(prev => [...prev, ...(data.items || [])]);
      } else {
        setProducts(data.items || []);
      }
      setPagination(data.pagination || null);
    } catch (err) {
      console.error('Failed to fetch products:', err);
      setError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [activeCategory, sort, search]);

  // Reset to page 1 when filters change
  useEffect(() => {
    fetchProducts(1, false);
  }, [fetchProducts]);

  // Sync URL params on navigation (skip first render to avoid double-fetch)
  const isMounted = useRef(false);
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    const urlSearch = searchParams.get('search') || '';
    const urlCat = searchParams.get('category') || initialCategory;
    if (urlSearch !== search) setSearch(urlSearch);
    if (urlCat !== activeCategory) setActiveCategory(urlCat);
  }, [searchParams]); // eslint-disable-line

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchProducts(1, false);
  };

  const loadMore = () => {
    if (pagination && pagination.page < pagination.totalPages) {
      fetchProducts(pagination.page + 1, true);
    }
  };

  const hasMore = pagination ? pagination.page < pagination.totalPages : false;

  return (
    <div style={{ position: 'relative' }}>
      {/* Ambient floating microgreens + salad leaves */}
      <FloatingGreenery count={14} style={{
        position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 0,
      }} />
      <div className="container" style={{ position: 'relative', zIndex: 1, paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-8)' }}>
      {/* Page Header */}
      <ScrollReveal variant="left">
        <div style={{ marginBottom: 'var(--space-8)', paddingTop: 'var(--space-4)' }}>
          <h1 className="section-title" style={{ marginBottom: 'var(--space-3)', letterSpacing: '-0.03em' }}>
            {t('Katalog', 'Каталог')}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-lg)', maxWidth: '46ch' }}>
            {t('Barcha mahsulotlar bir joyda — tanlang va buyurtma bering!', 'Все товары в одном месте — выбирайте и заказывайте.')}
          </p>
        </div>
      </ScrollReveal>

      {/* Search */}
      <form onSubmit={handleSearch} style={{ marginBottom: 'var(--space-4)' }}>
        <div className="search-bar" style={{ maxWidth: 'none' }}>
          <span className="search-bar__icon"><Search size={18} /></span>
          <input
            className="search-bar__input"
            type="text"
            placeholder={t("Mahsulot qidirish... (masalan: rukkola, urug', substrat)", "Поиск товаров... (например: руккола, семена, субстрат)")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            id="catalog-search"
          />
          <span className="search-bar__ai-badge">
            <Sparkles size={14} style={{ marginRight: '4px' }} /> AI
          </span>
        </div>
      </form>

      {/* Categories Scroll */}
      <div className="categories-scroll" style={{ paddingLeft: 0, marginBottom: 'var(--space-4)' }}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.slug}
            className={`category-pill ${activeCategory === cat.slug ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat.slug)}
            id={`filter-${cat.slug || 'all'}`}
          >
            <span className="category-pill__icon">{cat.icon}</span>
            <span className="category-pill__name">{t(cat.nameUz, cat.nameRu)}</span>
          </button>
        ))}
      </div>

      {/* Sort + Results Count */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 'var(--space-4)',
        flexWrap: 'wrap',
        gap: 'var(--space-2)',
      }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
          {pagination 
            ? t(`${pagination.total} ta mahsulotdan ${products.length} tasi`, `Показано ${products.length} из ${pagination.total} товаров`) 
            : t(`${products.length} ta mahsulot topildi`, `Найдено ${products.length} товаров`)}
        </span>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          style={{
            padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            fontSize: 'var(--text-sm)',
            outline: 'none',
            cursor: 'pointer',
          }}
          id="sort-select"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{t(opt.labelUz, opt.labelRu)}</option>
          ))}
        </select>
      </div>

      {/* Product Grid */}
      {loading ? (
        <div className="product-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="product-card" style={{ overflow: 'hidden' }}>
              <div className="skeleton skeleton-image" />
              <div style={{ padding: 'var(--space-3)' }}>
                <div className="skeleton skeleton-text" style={{ width: '40%' }} />
                <div className="skeleton skeleton-title" />
                <div className="skeleton skeleton-text" style={{ width: '60%' }} />
                <div className="skeleton skeleton-text" style={{ width: '100%', height: '36px', marginTop: '8px' }} />
              </div>
            </div>
          ))}
        </div>
      ) : products.length > 0 ? (
        <>
          <div className="product-grid">
            {products.map((product, idx) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 120, delay: Math.min(idx * 0.05, 0.3) }}
              >
                <ProductCard product={product} />
              </motion.div>
            ))}
          </div>

          {/* Load More */}
          {hasMore && (
            <div style={{ textAlign: 'center', marginTop: 'var(--space-6)' }}>
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="btn btn-outline btn-lg"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '14px 40px',
                  fontSize: 'var(--text-base)',
                  fontWeight: 600,
                  opacity: loadingMore ? 0.6 : 1,
                  transition: 'all 0.2s',
                }}
                id="load-more-btn"
              >
                {loadingMore ? (
                  <><Clock size={18} style={{ animation: 'pulse 1.5s infinite' }} /> {t('Yuklanmoqda...', 'Загрузка...')}</>
                ) : (
                  <><Plus size={18} /> {t(`Ko'proq ko'rsatish (${pagination!.total - products.length} ta qoldi)`, `Показать еще (осталось ${pagination!.total - products.length})`)}</>
                )}
              </button>
            </div>
          )}
        </>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-16)', color: 'var(--text-muted)' }}>
          <div style={{ marginBottom: 'var(--space-4)', color: 'var(--error)' }}><AlertTriangle size={64} /></div>
          <h3 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-2)', color: 'var(--error)' }}>
            {t('Xatolik yuz berdi', 'Произошла ошибка')}
          </h3>
          <p style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>
            {t('Ma\'lumotlarni yuklashda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.', 'Ошибка при загрузке данных. Пожалуйста, попробуйте еще раз.')}
          </p>
          <button className="btn btn-primary" onClick={() => fetchProducts(1, false)} style={{ display: 'inline-flex', alignItems: 'center' }}>
            <RefreshCw size={18} style={{ marginRight: 8 }} />
            {t('Qayta urinish', 'Повторить')}
          </button>
        </div>
      ) : (
        <div style={{
          textAlign: 'center',
          padding: 'var(--space-16)',
          color: 'var(--text-muted)',
        }}>
          <div style={{ marginBottom: 'var(--space-4)' }}><Search size={64} /></div>
          <h3 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-2)', color: 'var(--text-primary)' }}>
            {t('Hech narsa topilmadi', 'Ничего не найдено')}
          </h3>
          <p style={{ fontSize: 'var(--text-sm)' }}>
            {t("Boshqa so'z bilan qidirib ko'ring yoki kategoriyani o'zgartiring", "Попробуйте использовать другие слова или изменить категорию")}
          </p>
        </div>
      )}
      </div>
    </div>
  );
}

// Переиспользуется категорийным лендингом /catalog/<slug>: тот же клиент,
// но с предустановленной категорией из пути.
export function CatalogView({ initialCategory = '' }: { initialCategory?: string }) {
  return (
    <Suspense fallback={
      <div className="container" style={{ paddingTop: 'var(--space-6)' }}>
        <div className="skeleton skeleton-title" style={{ width: '200px', marginBottom: 'var(--space-6)' }} />
        <div className="product-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="product-card"><div className="skeleton skeleton-image" /></div>
          ))}
        </div>
      </div>
    }>
      <CatalogContent initialCategory={initialCategory} />
    </Suspense>
  );
}

export default function CatalogPage() {
  return (
    <Suspense fallback={
      <div className="container" style={{ paddingTop: 'var(--space-6)' }}>
        <div className="skeleton skeleton-title" style={{ width: '200px', marginBottom: 'var(--space-6)' }} />
        <div className="product-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="product-card"><div className="skeleton skeleton-image" /></div>
          ))}
        </div>
      </div>
    }>
      <CatalogContent />
    </Suspense>
  );
}

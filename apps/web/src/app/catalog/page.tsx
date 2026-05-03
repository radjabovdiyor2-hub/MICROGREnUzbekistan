'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ProductCard } from '@/components/shop/ProductCard';
import * as Icons from '@/components/ui/Icons';

const PAGE_SIZE = 24;

const CATEGORIES = [
  { slug: '', nameUz: 'Barchasi', icon: <Icons.Package size={18} /> },
  { slug: 'mikrozelen', nameUz: 'Mikroko\'katlar', icon: <Icons.Leaf size={18} /> },
  { slug: 'salaty', nameUz: 'Salatlar', icon: <Icons.Leaf size={18} /> },
  { slug: 'tsvety', nameUz: 'Gullar', icon: <Icons.Sparkles size={18} /> },
  { slug: 'semena', nameUz: 'Urug\'lar', icon: <Icons.Droplet size={18} /> },
  { slug: 'substrat', nameUz: 'Substrat', icon: <Icons.Package size={18} /> },
  { slug: 'udobreniya', nameUz: 'O\'g\'itlar', icon: <Icons.Zap size={18} /> },
  { slug: 'oborudovanie', nameUz: 'Uskunalar', icon: <Icons.Plug size={18} /> },
  { slug: 'nabory', nameUz: 'To\'plamlar', icon: <Icons.Package size={18} /> },
];

const SORT_OPTIONS = [
  { value: 'featured', label: "Tavsiya etilgan" },
  { value: 'price_asc', label: "Arzon → Qimmat" },
  { value: 'price_desc', label: "Qimmat → Arzon" },
  { value: 'rating', label: "Reyting bo'yicha" },
  { value: 'newest', label: "Eng yangi" },
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

function CatalogContent() {
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = useState(searchParams.get('category') || '');
  const [sort, setSort] = useState('featured');
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pagination, setPagination] = useState<Pagination | null>(null);

  const fetchProducts = useCallback(async (page = 1, append = false) => {
    if (page === 1) setLoading(true);
    else setLoadingMore(true);

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
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [activeCategory, sort, search]);

  // Reset to page 1 when filters change
  useEffect(() => {
    fetchProducts(1, false);
  }, [fetchProducts]);

  // Sync URL params on navigation
  useEffect(() => {
    const urlSearch = searchParams.get('search') || '';
    const urlCat = searchParams.get('category') || '';
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
    <div className="container" style={{ paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-8)' }}>
      {/* Page Header */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 className="section-title" style={{ marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Icons.Folder size={28} /> Katalog
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
          {t('Barcha mahsulotlar bir joyda — tanlang va buyurtma bering!', 'Все товары в одном месте — выбирайте и заказывайте!')}
        </p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} style={{ marginBottom: 'var(--space-4)' }}>
        <div className="search-bar" style={{ maxWidth: 'none' }}>
          <span className="search-bar__icon"><Icons.Search size={18} /></span>
          <input
            className="search-bar__input"
            type="text"
            placeholder="Mahsulot qidirish... (masalan: rukkola, urug', substrat)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            id="catalog-search"
          />
          <span className="search-bar__ai-badge">
            <Icons.Sparkles size={14} style={{ marginRight: '4px' }} /> AI
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
            <span className="category-pill__name">{cat.nameUz}</span>
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
          {pagination ? `${pagination.total} ta mahsulotdan ${products.length} tasi` : `${products.length} ta mahsulot topildi`}
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
            <option key={opt.value} value={opt.value}>{opt.label}</option>
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
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
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
                  borderRadius: '14px',
                  fontSize: 'var(--text-base)',
                  fontWeight: 600,
                  opacity: loadingMore ? 0.6 : 1,
                  transition: 'all 0.2s',
                }}
                id="load-more-btn"
              >
                {loadingMore ? (
                  <><Icons.Clock size={18} style={{ animation: 'pulse 1.5s infinite' }} /> Yuklanmoqda...</>
                ) : (
                  <><Icons.Plus size={18} /> Ko&apos;proq ko&apos;rsatish ({pagination!.total - products.length} ta qoldi)</>
                )}
              </button>
            </div>
          )}
        </>
      ) : (
        <div style={{
          textAlign: 'center',
          padding: 'var(--space-16)',
          color: 'var(--text-muted)',
        }}>
          <div style={{ marginBottom: 'var(--space-4)' }}><Icons.Search size={64} /></div>
          <h3 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-2)', color: 'var(--text-primary)' }}>
            Hech narsa topilmadi
          </h3>
          <p style={{ fontSize: 'var(--text-sm)' }}>
            Boshqa so&apos;z bilan qidirib ko&apos;ring yoki kategoriyani o&apos;zgartiring
          </p>
        </div>
      )}
    </div>
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

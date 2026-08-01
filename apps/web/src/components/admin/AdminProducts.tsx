'use client';

import { AdminProductMetrics } from './AdminProductMetrics';

import { AdminProductList } from './AdminProductList';

import { useState, useEffect, useCallback } from 'react';
import { AdminProductForm } from './AdminProductForm';
import { uploadImage } from './productImages';
import { useProductForm } from './useProductForm';
import { AdminProductFilters } from './AdminProductFilters';

export interface Product {
  id: string;
  nameUz: string;
  nameRu: string;
  price: number;
  oldPrice: number | null;
  costPrice: number | null;
  stock: number;
  isActive: boolean;
  isFeatured: boolean;
  isOnSale: boolean;
  images: string[];
  category?: { nameUz: string; nameRu: string; id: string };
}

interface Category {
  id: string;
  nameUz: string;
  nameRu: string;
  children?: Category[];
}

export const EMPTY_FORM = {
  nameUz: '', nameRu: '', slug: '', price: '', oldPrice: '', costPrice: '',
  categoryId: '', stock: '', sku: '', brand: '',
  descriptionUz: '', isFeatured: false, isOnSale: false,
};

export type ProductForm = typeof EMPTY_FORM;

const ADMIN_PAGE_SIZE = 50;

export function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [lang, setLang] = useState<'ru' | 'uz'>('ru');
  const [uploading, setUploading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [counts, setCounts] = useState({ total: 0, active: 0 });


  const fetchProducts = useCallback(async (pageNum = 1, append = false) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (categoryFilter) params.set('category', categoryFilter);
      params.set('limit', String(ADMIN_PAGE_SIZE));
      params.set('page', String(pageNum));
      params.set('all', 'true');
      const res = await fetch(`/api/products?${params}`);
      const data = await res.json();
      if (append) {
        setProducts(prev => [...prev, ...(data.items || [])]);
      } else {
        setProducts(data.items || []);
      }
      setPage(data.pagination?.page || 1);
      setTotalProducts(data.pagination?.total || 0);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (err) {
      console.error('Products fetch error:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [searchQuery, categoryFilter]);

  const {
    showForm, setShowForm, editingId, form, setForm, saving, formError, setFormError,
    images, setImages, handleNameChange, removeImage, openAdd, openEdit, handleSubmit,
  } = useProductForm(() => fetchProducts());

  const fetchCounts = useCallback(async () => {
    try {
      const res = await fetch('/api/products?count=true');
      const data = await res.json();
      setCounts({ total: data.total || 0, active: data.active || 0 });
    } catch { /* ignore */ }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories');
      const data = await res.json();
      setCategories(data.categories || []);
    } catch (err) {
      console.error('Categories fetch error:', err);
    }
  }, []);

  // Справочники не зависят от фильтров — грузим один раз.
  useEffect(() => { fetchCategories(); fetchCounts(); }, [fetchCategories, fetchCounts]);

  // Товары — с дебаунсом, и на первом рендере, и при смене фильтров.
  // Раньше первый запрос уходил дважды: сразу на маунте и ещё раз по таймеру.
  useEffect(() => {
    const timer = setTimeout(() => fetchProducts(1), 300);
    return () => clearTimeout(timer);
  }, [fetchProducts]);

  const toggleActive = async (product: Product) => {
    try {
      await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: product.id, isActive: !product.isActive }),
      });
      fetchProducts();
    } catch (err) {
      console.error('Toggle error:', err);
    }
  };

  const uploadImageFile = async (file: File) => {
    setUploading(true);
    setFormError('');
    const result = await uploadImage(file);
    if (result.ok) setImages(prev => [...prev, result.url]);
    else setFormError(result.error);
    setUploading(false);
  };

  const deleteProduct = async (id: string) => {
    if (!confirm("Bu tovarni o'chirmoqchimisiz?")) return;
    try {
      await fetch(`/api/products?id=${id}`, { method: 'DELETE' });
      fetchProducts();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

  // Only top-level categories for filter (no duplicates from children)
  const topCategories = categories.filter(c => !categories.some(p => p.children?.some(ch => ch.id === c.id)));
  const allCategories = categories.flatMap(c => [c, ...(c.children || [])]);
  const activeCount = counts.active;
  const lowStock = products.filter(p => p.stock < 10).length;
  const hasMore = page < totalPages;

  const inputStyle = {
    width: '100%', padding: 'var(--space-2) var(--space-3)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-secondary)', color: 'var(--text-primary)',
    fontSize: 'var(--text-sm)', outline: 'none',
  };

  const t = (ru: string, uz: string) => lang === 'ru' ? ru : uz;

  // ========== ADD/EDIT FORM ==========
  if (showForm) {
    return (
      <AdminProductForm
        form={form}
        setForm={setForm}
        editingId={editingId}
        formError={formError}
        saving={saving}
        uploading={uploading}
        images={images}
        allCategories={allCategories}
        lang={lang}
        t={t}
        inputStyle={inputStyle}
        handleNameChange={handleNameChange}
        handleSubmit={handleSubmit}
        uploadImage={uploadImageFile}
        removeImage={removeImage}
        setShowForm={setShowForm}
      />
    );
  }

  // ========== PRODUCT LIST ==========
  return (
    <div>
      <AdminProductMetrics
        counts={counts}
        activeCount={activeCount}
        lowStock={lowStock}
        lang={lang}
        setLang={setLang}
        t={t}
      />
      <AdminProductFilters
        topCategories={topCategories} categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter} searchQuery={searchQuery}
        setSearchQuery={setSearchQuery} lang={lang} counts={counts} t={t} onAdd={openAdd} />

      <AdminProductList
        products={products}
        loading={loading}
        loadingMore={loadingMore}
        hasMore={hasMore}
        page={page}
        totalProducts={totalProducts}
        lang={lang}
        t={t}
        fmt={fmt}
        openEdit={openEdit}
        toggleActive={toggleActive}
        deleteProduct={deleteProduct}
        fetchProducts={fetchProducts}
      />
    </div>
  );
}

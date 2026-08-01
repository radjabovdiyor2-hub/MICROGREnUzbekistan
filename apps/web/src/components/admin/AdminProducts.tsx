'use client';

import { AdminProductList } from './AdminProductList';

import { useState, useEffect } from 'react';
import { AdminProductForm } from './AdminProductForm';
import { AlertTriangle, CheckCircle, Plus, Search, Tag } from 'lucide-react';

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
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [counts, setCounts] = useState({ total: 0, active: 0 });

  const fetchProducts = async (pageNum = 1, append = false) => {
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
  };

  const fetchCounts = async () => {
    try {
      const res = await fetch('/api/products?count=true');
      const data = await res.json();
      setCounts({ total: data.total || 0, active: data.active || 0 });
    } catch { /* ignore */ }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories');
      const data = await res.json();
      setCategories(data.categories || []);
    } catch (err) {
      console.error('Categories fetch error:', err);
    }
  };

  useEffect(() => { fetchProducts(1); fetchCategories(); fetchCounts(); }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchProducts(1), 300);
    return () => clearTimeout(timer);
    // Дебаунс поиска: перезапуск нужен только при смене фильтров.
    // fetchProducts не мемоизирована и в зависимостях сбрасывала бы таймер.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, categoryFilter]);

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

  const autoSlug = (name: string) => {
    return name.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 60);
  };

  const handleNameChange = (val: string) => {
    setForm(f => ({
      ...f,
      nameUz: val,
      slug: editingId ? f.slug : autoSlug(val),
    }));
  };

  // Compress image on client before upload — turns 10MB phone photo into ~200KB
  const compressImage = (file: File, maxSize = 1200, quality = 0.8): Promise<File> => {
    return new Promise((resolve) => {
      // Skip if already small
      if (file.size < 300 * 1024) { resolve(file); return; }

      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;

        // Scale down to maxSize
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round(height * maxSize / width);
            width = maxSize;
          } else {
            width = Math.round(width * maxSize / height);
            height = maxSize;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (blob) {
            const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
            resolve(compressed);
          } else {
            resolve(file);
          }
        }, 'image/jpeg', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    setFormError('');
    try {
      // Compress first
      const compressed = await compressImage(file);
      const sizeMB = (compressed.size / 1024 / 1024).toFixed(1);

      const formData = new FormData();
      formData.append('file', compressed);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok && res.status === 413) {
        setFormError(`Fayl juda katta: ${sizeMB}MB`);
        return;
      }
      const data = await res.json();
      if (data.success && data.url) {
        setImages(prev => [...prev, data.url]);
        setFormError('');
      } else {
        setFormError(data.error || `Yuklashda xatolik`);
      }
    } catch (err) {
      console.error('Upload error:', err);
      setFormError(`Tarmoq xatosi: yuklanmadi`);
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setImages([]);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (p: Product) => {
    setEditingId(p.id);
    setForm({
      nameUz: p.nameUz, nameRu: p.nameRu, slug: '',
      price: String(p.price), oldPrice: p.oldPrice ? String(p.oldPrice) : '',
      costPrice: p.costPrice ? String(p.costPrice) : '', categoryId: p.category?.id || '', stock: String(p.stock),
      sku: '', brand: '', descriptionUz: '',
      isFeatured: p.isFeatured, isOnSale: p.isOnSale,
    });
    setImages(p.images || []);
    setFormError('');
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.nameUz || !form.price || !form.categoryId) {
      setFormError("Nom, narx va kategoriyani to'ldiring");
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload: Record<string, unknown> = {
        nameUz: form.nameUz,
        nameRu: form.nameRu || form.nameUz,
        price: parseInt(form.price),
        categoryId: form.categoryId,
        stock: parseInt(form.stock) || 0,
        isFeatured: form.isFeatured,
        isOnSale: form.isOnSale,
      };
      if (form.oldPrice) payload.oldPrice = parseInt(form.oldPrice);
      else if (editingId) payload.oldPrice = null;
      payload.costPrice = form.costPrice ? parseInt(form.costPrice) : null;
      if (form.brand) payload.brand = form.brand;
      if (form.sku) payload.sku = form.sku;
      if (form.descriptionUz) payload.descriptionUz = form.descriptionUz;
      payload.images = images;

      if (editingId) {
        payload.id = editingId;
        await fetch('/api/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        payload.slug = form.slug || autoSlug(form.nameUz) + '-' + Date.now().toString(36);
        await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
      fetchProducts();
    } catch (err) {
      console.error('Save error:', err);
      setFormError('Xatolik yuz berdi');
    } finally {
      setSaving(false);
    }
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
        uploadImage={uploadImage}
        removeImage={removeImage}
        setShowForm={setShowForm}
      />
    );
  }

  // ========== PRODUCT LIST ==========
  return (
    <div>
      {/* Lang toggle + Metrics */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-2)' }}>
        <button onClick={() => setLang(l => l === 'ru' ? 'uz' : 'ru')}
          style={{ padding: '4px 12px', borderRadius: 'var(--radius-full)', fontSize: '11px', fontWeight: 700, border: '1.5px solid var(--border)', cursor: 'pointer', background: 'var(--bg-secondary)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.2s' }}>
          {lang === 'ru' ? '🇷🇺 RU' : '🇺🇿 UZ'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        <div className="card" style={{ padding: 'var(--space-2) var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Tag size={16} style={{ color: 'var(--brand-primary)', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t('Всего', 'Jami')}</div>
            <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-sm)' }}>{counts.total}</div>
          </div>
        </div>
        <div className="card" style={{ padding: 'var(--space-2) var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <CheckCircle size={16} style={{ color: 'var(--success)', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t('Активных', 'Aktiv')}</div>
            <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-sm)' }}>{activeCount}</div>
          </div>
        </div>
        <div className="card" style={{ padding: 'var(--space-2) var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <AlertTriangle size={16} style={{ color: 'var(--warning)', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t('Мало', 'Kam')}</div>
            <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-sm)' }}>{lowStock}</div>
          </div>
        </div>
      </div>

      {/* Category Filter — top-level only, no duplicates */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: 'var(--space-2)', overflowX: 'auto', paddingBottom: 4 }}>
        <button onClick={() => setCategoryFilter('')}
          style={{ padding: '5px 12px', borderRadius: 'var(--radius-full)', fontSize: '12px', fontWeight: 600, border: '1.5px solid', whiteSpace: 'nowrap', cursor: 'pointer', transition: 'all 0.2s', background: !categoryFilter ? 'var(--brand-primary)' : 'transparent', color: !categoryFilter ? 'white' : 'var(--text-secondary)', borderColor: !categoryFilter ? 'var(--brand-primary)' : 'var(--border)' }}>
          {t('Все', 'Barchasi')} ({counts.total})
        </button>
        {topCategories.map(c => (
          <button key={c.id} onClick={() => setCategoryFilter(c.id)}
            style={{ padding: '5px 12px', borderRadius: 'var(--radius-full)', fontSize: '12px', fontWeight: 600, border: '1.5px solid', whiteSpace: 'nowrap', cursor: 'pointer', transition: 'all 0.2s', background: categoryFilter === c.id ? 'var(--brand-primary)' : 'transparent', color: categoryFilter === c.id ? 'white' : 'var(--text-secondary)', borderColor: categoryFilter === c.id ? 'var(--brand-primary)' : 'var(--border)' }}>
            {lang === 'ru' ? (c.nameRu || c.nameUz) : c.nameUz}
          </button>
        ))}
      </div>

      {/* Search + Add */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input type="text" placeholder={t('Поиск товаров...', 'Qidirish...')} value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '8px 8px 8px 34px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', outline: 'none', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }} />
        </div>
        <button onClick={openAdd} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
          <Plus size={16} /> {t('Новый', 'Yangi')}
        </button>
      </div>

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

'use client';

import { useState, useEffect } from 'react';
import {
  AlertTriangle, ArrowLeft, Camera, CheckCircle, Clock, Edit, Plus, Search, Tag, Trash, XCircle,
} from 'lucide-react';

interface Product {
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

const EMPTY_FORM = {
  nameUz: '', nameRu: '', slug: '', price: '', oldPrice: '', costPrice: '',
  categoryId: '', stock: '', sku: '', brand: '',
  descriptionUz: '', isFeatured: false, isOnSale: false,
};

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
  }, [searchQuery, categoryFilter]); // eslint-disable-line

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
      <div>
        <button onClick={() => setShowForm(false)} className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ArrowLeft size={16} /> {t('Назад', 'Orqaga')}
        </button>
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={18} /> {editingId ? t('Редактирование', 'Tahrirlash') : t('Добавить товар', "Yangi tovar qo'shish")}
          </h3>

          {formError && <div style={{ padding: 'var(--space-2) var(--space-3)', background: 'var(--error-bg)', color: 'var(--error)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>{formError}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>{t('Название (UZ) *', 'Nomi (UZ) *')}</label>
              <input style={inputStyle} value={form.nameUz} onChange={e => handleNameChange(e.target.value)} placeholder="Rukkola mikroko'kati" />
            </div>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>{t('Название (RU)', 'Nomi (RU)')}</label>
              <input style={inputStyle} value={form.nameRu} onChange={e => setForm(f => ({ ...f, nameRu: e.target.value }))} placeholder="Микрозелень Руккола" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>{t('Цена продажи (сум) *', "Sotuv narxi (so'm) *")}</label>
              <input style={inputStyle} type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="15000" />
            </div>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--success)', display: 'block', marginBottom: 2, fontWeight: 600 }}>{t('Себестоимость', 'Tan narxi')}</label>
              <input style={{ ...inputStyle, borderColor: form.costPrice ? 'var(--success)' : 'var(--border)' }} type="number" value={form.costPrice} onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))} placeholder="10000" />
              {form.price && form.costPrice && (
                <div style={{ fontSize: '10px', marginTop: 3, color: parseInt(form.price) > parseInt(form.costPrice) ? 'var(--success)' : 'var(--error)', fontWeight: 600 }}>
                  Прибыль: {(parseInt(form.price) - parseInt(form.costPrice)).toLocaleString()} сум ({((parseInt(form.price) - parseInt(form.costPrice)) / parseInt(form.price) * 100).toFixed(0)}% маржа)
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Старая цена</label>
              <input style={inputStyle} type="number" value={form.oldPrice} onChange={e => setForm(f => ({ ...f, oldPrice: e.target.value }))} placeholder="20000" />
            </div>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>На складе *</label>
              <input style={inputStyle} type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} placeholder="100" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Категория *</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}>
                <option value="">Выберите...</option>
                {allCategories.map(c => (
                  <option key={c.id} value={c.id}>{lang === 'ru' ? (c.nameRu || c.nameUz) : c.nameUz}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Бренд</label>
              <input style={inputStyle} value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} placeholder="Microgreen UZ" />
            </div>
          </div>

          <div style={{ marginBottom: 'var(--space-3)' }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Описание</label>
            <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={form.descriptionUz}
              onChange={e => setForm(f => ({ ...f, descriptionUz: e.target.value }))} placeholder="Краткое описание..." />
          </div>

          {/* Image upload */}
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Фото</label>

            {/* Preview grid */}
            {images.length > 0 && (
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
                {images.map((url, idx) => (
                  <div key={idx} style={{
                    position: 'relative', width: 72, height: 72, borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0,
                  }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Rasm ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button onClick={() => removeImage(idx)} type="button"
                      style={{
                        position: 'absolute', top: 2, right: 2, width: 20, height: 20,
                        borderRadius: 'var(--radius-full)', background: 'var(--error)', color: 'white',
                        border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: '12px', lineHeight: 1, padding: 0,
                      }}>
                      <XCircle size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload button */}
            <label style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              padding: 'var(--space-3)', border: '2px dashed var(--border)', borderRadius: 'var(--radius-md)',
              cursor: uploading ? 'wait' : 'pointer', color: 'var(--text-muted)', fontSize: 'var(--text-sm)',
              transition: 'all var(--transition-fast)', background: 'var(--bg-secondary)',
            }}>
              {uploading ? (
                <><Clock size={18} style={{ animation: 'pulse 1s infinite' }} /> Загрузка...</>
              ) : (
                <><Plus size={18} /> Добавить фото</>
              )}
              <input type="file" accept="image/*"
                style={{ display: 'none' }}
                disabled={uploading}
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) {
                    uploadImage(file);
                    e.target.value = '';
                  }
                }}
              />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.isFeatured} onChange={e => setForm(f => ({ ...f, isFeatured: e.target.checked }))} />
              Рекомендуемый
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.isOnSale} onChange={e => setForm(f => ({ ...f, isOnSale: e.target.checked }))} />
              Скидка
            </label>
          </div>

          <button onClick={handleSubmit} disabled={saving} className="btn btn-primary btn-lg btn-block"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>
            {saving ? <><Clock size={18} /> {t('Сохранение...', 'Saqlanmoqda...')}</> : <><CheckCircle size={18} /> {editingId ? t('СОХРАНИТЬ', 'SAQLASH') : t('ДОБАВИТЬ', "QO'SHISH")}</>}
          </button>
        </div>
      </div>
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

      {/* Products List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
          <Clock size={32} style={{ animation: 'pulse 1.5s infinite' }} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {products.map(p => (
            <div key={p.id} className="card" style={{
              padding: 'var(--space-3)', opacity: p.isActive ? 1 : 0.5,
            }}>
              {/* Row 1: Thumbnail + Name + Price */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                {/* Thumbnail */}
                <div style={{
                  width: 44, height: 44, borderRadius: 'var(--radius-sm)', overflow: 'hidden',
                  background: 'var(--bg-tertiary)', flexShrink: 0, border: '1px solid var(--border)',
                }}>
                  {p.images && p.images.length > 0 ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                      <Camera size={18} />
                    </div>
                  )}
                </div>
                {/* Name */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nameUz}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{lang === 'ru' ? ((p.category as any)?.nameRu || p.category?.nameUz) : p.category?.nameUz || t('Без категории', 'Kategoriyasiz')}</div>
                </div>
                {/* Price */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 'var(--font-bold)', color: 'var(--brand-primary)', fontSize: 'var(--text-sm)' }}>{fmt(p.price)}</div>
                </div>
              </div>

              {/* Row 2: Stock badge + Actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  {/* Stock badge */}
                  <span style={{
                    padding: '2px 8px', borderRadius: 'var(--radius-full)', fontSize: '11px', fontWeight: 'var(--font-semibold)',
                    background: p.stock === 0 ? 'var(--error-bg)' : p.stock < 5 ? 'var(--warning-bg)' : 'var(--success-bg)',
                    color: p.stock === 0 ? 'var(--error)' : p.stock < 5 ? 'var(--warning)' : 'var(--success)',
                  }}>
                    {p.stock} {t('шт', 'dona')}
                  </span>
                  {/* Status indicator */}
                  {!p.isActive && (
                    <span style={{ padding: '2px 8px', borderRadius: 'var(--radius-full)', fontSize: '10px', background: 'var(--error-bg)', color: 'var(--error)' }}>
                      {t('Неактив', 'Nofaol')}
                    </span>
                  )}
                  {p.isFeatured && (
                    <span style={{ padding: '2px 6px', borderRadius: 'var(--radius-full)', fontSize: '10px', background: 'color-mix(in srgb, var(--cat-1) 12%, transparent)', color: 'var(--cat-1)' }}>
                      ★
                    </span>
                  )}
                </div>
                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button onClick={() => openEdit(p)} className="btn btn-ghost btn-sm"
                    style={{ padding: '6px', color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)' }}>
                    <Edit size={15} />
                  </button>
                  <button onClick={() => toggleActive(p)} className="btn btn-ghost btn-sm"
                    title={p.isActive ? t('Деактивировать', 'Nofaol qilish') : t('Активировать', 'Faol qilish')}
                    style={{
                      padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                      display: 'flex', alignItems: 'center', gap: '4px',
                      background: p.isActive ? '#10B98118' : '#EF444418',
                      color: p.isActive ? '#059669' : 'var(--error)',
                      border: `1.5px solid ${p.isActive ? '#10B98140' : '#EF444440'}`,
                      transition: 'all 0.2s',
                    }}>
                    {p.isActive ? <CheckCircle size={13} /> : <XCircle size={13} />}
                    {p.isActive ? t('Актив', 'Faol') : t('Неактив', 'Nofaol')}
                  </button>
                  <button onClick={() => deleteProduct(p.id)} className="btn btn-ghost btn-sm"
                    style={{ padding: '6px', color: 'var(--error)', borderRadius: 'var(--radius-sm)' }}>
                    <Trash size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {/* Load More */}
          {hasMore && (
            <button
              onClick={() => fetchProducts(page + 1, true)}
              disabled={loadingMore}
              className="btn btn-outline"
              style={{
                width: '100%', marginTop: 'var(--space-3)', padding: '12px',
                borderRadius: '12px', fontSize: 'var(--text-sm)', fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                opacity: loadingMore ? 0.6 : 1,
              }}
            >
              {loadingMore ? (
                <><Clock size={16} style={{ animation: 'pulse 1s infinite' }} /> Загрузка...</>
              ) : (
                <><Plus size={16} /> Ещё ({totalProducts - products.length} осталось)</>  
              )}
            </button>
          )}
          {/* Showing count */}
          <div style={{ textAlign: 'center', padding: 'var(--space-2)', fontSize: '11px', color: 'var(--text-muted)' }}>
            {products.length} / {totalProducts} товаров показано
          </div>
        </div>
      )}
    </div>
  );
}

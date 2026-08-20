'use client';

import { useState } from 'react';
import { Toast } from '@/components/ui/Toast';
import { AdminProductMetrics } from './AdminProductMetrics';
import { AdminProductList } from './AdminProductList';
import { AdminProductForm } from './AdminProductForm';
import { AdminProductFilters } from './AdminProductFilters';
import { uploadImage } from './productImages';
import { useProductForm } from './useProductForm';
import { useAdminProducts } from './useAdminProducts';

import { type Product, type Category, EMPTY_FORM, type ProductForm } from './productTypes';
export type { Product, Category, ProductForm };
export { EMPTY_FORM };

// Экран «Товары». Данные и мутации живут в `useAdminProducts` — здесь только
// раскладка и диалоги подтверждения.

export function AdminProducts() {
  const [lang, setLang] = useState<'ru' | 'uz'>('ru');
  const [uploading, setUploading] = useState(false);

  const {
    mode, setMode, searchInput, setSearchInput, categoryFilter, setCategoryFilter,
    notice, setNotice, products, total, loading, loadingMore, hasMore, loadMore,
    listError, counts, categories, remove, toggleActive, refreshAll,
  } = useAdminProducts();

  const {
    showForm, setShowForm, editingId, form, setForm, saving, formError, setFormError,
    images, setImages, handleNameChange, removeImage, openAdd, openEdit, handleSubmit,
  } = useProductForm(refreshAll);

  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);

  const uploadImageFile = async (file: File) => {
    setUploading(true);
    setFormError('');
    const result = await uploadImage(file);
    if (result.ok) setImages(prev => [...prev, result.url]);
    else setFormError(result.error);
    setUploading(false);
  };

  /**
   * Обычное «удалить». Диалог больше не обещает того, чего может не случиться:
   * товар с продажами сервер снимет с продажи и уберёт в архив, а объяснение
   * покажет тостом. Раньше здесь стояло «o'chirmoqchimisiz?» — и владелец,
   * подтвердив удаление, видел товар на прежнем месте.
   */
  const deleteProduct = (id: string) => {
    const ok = window.confirm(
      t(
        'Снять товар с продажи и убрать в архив? Если по нему не было продаж — он удалится сразу.',
        "Tovarni sotuvdan olib, arxivga o'tkazamizmi? Sotuvlari bo'lmasa — butunlay o'chadi.",
      ),
    );
    if (ok) remove.mutate({ id, force: false });
  };

  /**
   * Удаление из архива — необратимое. История продаж переживает его: позиции
   * заказов и движения склада сохраняют название в снимке (см. схему,
   * `OrderItem.productName`), поэтому выручка прошлых месяцев не меняется.
   */
  const deleteForever = (product: Product) => {
    const ok = window.confirm(
      t(
        `Удалить «${product.nameUz}» НАВСЕГДА?\n\nТовар исчезнет из каталога без возможности восстановить. ` +
          `История продаж сохранится: в отчётах он останется под этим названием.`,
        `«${product.nameUz}» BUTUNLAY o'chirilsinmi?\n\nTovar katalogdan qaytarib bo'lmaydigan tarzda yo'qoladi. ` +
          `Sotuvlar tarixi saqlanadi: hisobotlarda shu nom bilan qoladi.`,
      ),
    );
    if (ok) remove.mutate({ id: product.id, force: true });
  };

  const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

  // Only top-level categories for filter (no duplicates from children)
  const topCategories = categories.filter(c => !categories.some(p => p.children?.some(ch => ch.id === c.id)));
  const allCategories = categories.flatMap(c => [c, ...(c.children || [])]);
  const lowStock = products.filter(p => p.stock < 10).length;

  const inputStyle = {
    width: '100%', padding: 'var(--space-2) var(--space-3)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-secondary)', color: 'var(--text-primary)',
    fontSize: 'var(--text-sm)', outline: 'none',
  };

  // ========== ADD/EDIT FORM ==========
  if (showForm) {
    return (
      <AdminProductForm
        form={form} setForm={setForm} editingId={editingId} formError={formError}
        saving={saving} uploading={uploading} images={images} allCategories={allCategories}
        lang={lang} t={t} inputStyle={inputStyle} handleNameChange={handleNameChange}
        handleSubmit={handleSubmit} uploadImage={uploadImageFile} removeImage={removeImage}
        setShowForm={setShowForm}
      />
    );
  }

  // ========== PRODUCT LIST ==========
  return (
    <div>
      {notice && (
        <Toast
          inline
          variant={notice.variant}
          onClose={() => setNotice(null)}
          style={{ marginBottom: 'var(--space-3)' }}
        >
          {notice.text}
        </Toast>
      )}
      {listError && (
        <Toast inline variant="error" style={{ marginBottom: 'var(--space-3)' }}>
          {listError}
        </Toast>
      )}

      <AdminProductMetrics
        counts={counts}
        activeCount={counts.active}
        lowStock={lowStock}
        lang={lang}
        setLang={setLang}
        t={t}
      />
      <AdminProductFilters
        topCategories={topCategories} categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter} searchQuery={searchInput}
        setSearchQuery={setSearchInput} lang={lang} counts={counts} t={t} onAdd={openAdd}
        mode={mode} setMode={setMode} />

      <AdminProductList
        products={products}
        loading={loading}
        loadingMore={loadingMore}
        hasMore={hasMore}
        totalProducts={total}
        mode={mode}
        lang={lang}
        t={t}
        fmt={fmt}
        openEdit={openEdit}
        toggleActive={p => toggleActive.mutate(p)}
        deleteProduct={deleteProduct}
        deleteForever={deleteForever}
        loadMore={loadMore}
      />
    </div>
  );
}

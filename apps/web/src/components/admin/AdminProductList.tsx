'use client';

import {
  Camera, CheckCircle, Clock, Edit, Plus, Trash, XCircle,
} from 'lucide-react';
import type { Product } from './productTypes';
import type { ProductMode } from './useAdminProducts';

// Список товаров админки: строка товара, остаток, действия и подгрузка.
// Вынесен из AdminProducts — форма товара уже отдельно, здесь вторая
// половина экрана.


interface Props {
  products: Product[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  totalProducts: number;
  /** В архиве действия другие: вернуть в продажу или удалить навсегда. */
  mode: ProductMode;
  lang: 'ru' | 'uz';
  t: (ru: string, uz: string) => string;
  fmt: (n: number) => string;
  openEdit: (p: Product) => void;
  toggleActive: (p: Product) => void;
  deleteProduct: (id: string) => void;
  deleteForever: (p: Product) => void;
  loadMore: () => void;
}

export function AdminProductList({ products, loading, loadingMore, hasMore, totalProducts, mode, lang, t, fmt, openEdit, toggleActive, deleteProduct, deleteForever, loadMore }: Props) {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
        <Clock size={32} style={{ animation: 'pulse 1.5s infinite' }} />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
        {mode === 'archived'
          ? t('Архив пуст — все товары в продаже.', "Arxiv bo'sh — barcha tovarlar sotuvda.")
          : t('Товаров не найдено.', 'Tovar topilmadi.')}
      </div>
    );
  }

  return (
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
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{lang === 'ru' ? (p.category?.nameRu || p.category?.nameUz) : p.category?.nameUz || t('Без категории', 'Kategoriyasiz')}</div>
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
                {t('В архиве', 'Arxivda')}
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
              title={p.isActive ? t('Убрать в архив', 'Arxivga') : t('Вернуть в продажу', 'Sotuvga qaytarish')}
              style={{
                padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: '4px',
                background: p.isActive ? 'var(--success-bg)' : 'var(--error-bg)',
                color: p.isActive ? 'var(--success)' : 'var(--error)',
                border: `1.5px solid ${p.isActive ? 'var(--success)' : 'var(--error)'}`,
                transition: 'all 0.2s',
              }}>
              {p.isActive ? <CheckCircle size={13} /> : <XCircle size={13} />}
              {p.isActive ? t('Актив', 'Faol') : t('Вернуть', 'Qaytarish')}
            </button>
            {/* Насовсем — только из архива: в списке «В продаже» такая кнопка
                стояла бы рядом с обычным удалением и путала бы их между собой. */}
            {mode === 'archived' ? (
              <button onClick={() => deleteForever(p)} className="btn btn-ghost btn-sm"
                title={t('Удалить навсегда', "Butunlay o'chirish")}
                style={{
                  padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: '4px',
                  background: 'var(--error)', color: 'white', border: '1.5px solid var(--error)',
                }}>
                <Trash size={13} /> {t('Навсегда', 'Butunlay')}
              </button>
            ) : (
              <button onClick={() => deleteProduct(p.id)} className="btn btn-ghost btn-sm"
                title={t('Убрать в архив', 'Arxivga')}
                style={{ padding: '6px', color: 'var(--error)', borderRadius: 'var(--radius-sm)' }}>
                <Trash size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    ))}
    {/* Load More */}
    {hasMore && (
      <button
        onClick={loadMore}
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
  );
}

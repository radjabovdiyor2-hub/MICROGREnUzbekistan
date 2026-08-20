'use client';

import { Archive, Plus, Search, Store } from 'lucide-react';
import type { ProductMode } from './useAdminProducts';

// Режим списка, фильтр по рубрикам и строка поиска над списком товаров.
// Вынесено из AdminProducts: файл перерос 200 строк.

interface Category { id: string; nameUz: string; nameRu: string }

const chip = (active: boolean) => ({
  padding: '5px 12px', borderRadius: 'var(--radius-full)', fontSize: '12px',
  fontWeight: 600, border: '1.5px solid', whiteSpace: 'nowrap' as const,
  cursor: 'pointer', transition: 'all 0.2s',
  background: active ? 'var(--brand-primary)' : 'transparent',
  color: active ? 'white' : 'var(--text-secondary)',
  borderColor: active ? 'var(--brand-primary)' : 'var(--border)',
});

export function AdminProductFilters({
  topCategories, categoryFilter, setCategoryFilter, searchQuery, setSearchQuery,
  lang, counts, t, onAdd, mode, setMode,
}: {
  topCategories: Category[];
  categoryFilter: string;
  setCategoryFilter: (v: string) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  lang: 'ru' | 'uz';
  counts: { total: number; active: number; archived: number };
  t: (ru: string, uz: string) => string;
  onAdd: () => void;
  mode: ProductMode;
  setMode: (v: ProductMode) => void;
}) {
  return (
    <>
  {/* Режим: в продаже или архив.
      Раньше списка было два состояния в одном: `all=true` показывал живые и
      снятые вперемешку, и «удалённый» товар возвращался на экран следующим
      же запросом — на глаз неотличимо от «удаление не сработало». */}
  <div style={{ display: 'flex', gap: '6px', marginBottom: 'var(--space-2)' }}>
    <button onClick={() => setMode('active')} style={{ ...chip(mode === 'active'), display: 'flex', alignItems: 'center', gap: 5 }}>
      <Store size={13} /> {t('В продаже', 'Sotuvda')} ({counts.active})
    </button>
    <button onClick={() => setMode('archived')} style={{ ...chip(mode === 'archived'), display: 'flex', alignItems: 'center', gap: 5 }}>
      <Archive size={13} /> {t('Архив', 'Arxiv')} ({counts.archived})
    </button>
  </div>

  {/* Category Filter — top-level only, no duplicates */}
  <div style={{ display: 'flex', gap: '6px', marginBottom: 'var(--space-2)', overflowX: 'auto', paddingBottom: 4 }}>
    <button onClick={() => setCategoryFilter('')} style={chip(!categoryFilter)}>
      {t('Все', 'Barchasi')}
    </button>
    {topCategories.map(c => (
      <button key={c.id} onClick={() => setCategoryFilter(c.id)} style={chip(categoryFilter === c.id)}>
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
    <button onClick={onAdd} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
      <Plus size={16} /> {t('Новый', 'Yangi')}
    </button>
  </div>

    </>
  );
}

'use client';

import { Plus, Search } from 'lucide-react';

// Фильтр по рубрикам и строка поиска над списком товаров.
// Вынесено из AdminProducts: файл перерос 200 строк.

interface Category { id: string; nameUz: string; nameRu: string }

export function AdminProductFilters({
  topCategories, categoryFilter, setCategoryFilter, searchQuery, setSearchQuery, lang, counts, t, onAdd,
}: {
  topCategories: Category[];
  categoryFilter: string;
  setCategoryFilter: (v: string) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  lang: 'ru' | 'uz';
  counts: { total: number; active: number };
  t: (ru: string, uz: string) => string;
  onAdd: () => void;
}) {
  return (
    <>
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
    <button onClick={onAdd} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
      <Plus size={16} /> {t('Новый', 'Yangi')}
    </button>
  </div>

    </>
  );
}

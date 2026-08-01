'use client';

import type React from 'react';

// Форма создания рубрики каталога.
// Вынесено из AdminCategories: форма показывается по флагу и от списка не зависит.

interface Props {
  nameUz: string;
  setNameUz: (v: string) => void;
  nameRu: string;
  setNameRu: (v: string) => void;
  slug: string;
  setSlug: (v: string) => void;
  icon: string;
  setIcon: (v: string) => void;
  create: (e: React.FormEvent) => void;
  t: (ru: string, uz: string) => string;
  inputStyle: React.CSSProperties;
}

export function AdminCategoryForm({ nameUz, setNameUz, nameRu, setNameRu, slug, setSlug, icon, setIcon, create, t, inputStyle }: Props) {
  return (
      <form onSubmit={create} className="card" style={{ padding: 'var(--space-5)', borderRadius: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-3)' }}>
          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
              {t('Слаг (в адресе)', 'Slug (manzilda)')}
            </label>
            <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase())}
              placeholder="microgreens" style={inputStyle} required />
          </div>
          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
              {t('Название (RU)', 'Nomi (RU)')}
            </label>
            <input value={nameRu} onChange={e => setNameRu(e.target.value)} style={inputStyle} required />
          </div>
          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
              {t('Название (UZ)', 'Nomi (UZ)')}
            </label>
            <input value={nameUz} onChange={e => setNameUz(e.target.value)} style={inputStyle} required />
          </div>
          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
              {t('Иконка (эмодзи)', 'Ikonka (emoji)')}
            </label>
            <input value={icon} onChange={e => setIcon(e.target.value)} placeholder="🌱" style={inputStyle} />
          </div>
        </div>
        <button type="submit" className="btn btn-primary" style={{ marginTop: 'var(--space-4)' }}>
          {t('Создать', 'Yaratish')}
        </button>
      </form>
  );
}

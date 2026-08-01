'use client';

import { PasswordCard } from './AdminPasswordCard';
import { AlertTriangle, CheckCircle, Clock, RotateCcw, Save, Search } from 'lucide-react';
import { AdminSettingField } from './AdminSettingField';
import { useAdminSettings } from './useAdminSettings';

export interface Field {
  key: string;
  category: string;
  type: 'number' | 'money' | 'string' | 'text' | 'boolean' | 'list';
  labelRu: string;
  labelUz: string;
  hintRu: string | null;
  min: number | null;
  max: number | null;
  default: unknown;
  value: unknown;
  modified: boolean;
}

export interface Category { id: string; ru: string; uz: string }

export function AdminSettings({ lang = 'ru' }: { lang?: 'ru' | 'uz' }) {
  const {
    categories, draft, setDraft, loading, saving, search, setSearch,
    msg, fieldErrors, setFieldErrors, save, dirty, grouped, current, setValue, t,
  } = useAdminSettings(lang);

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)',
    borderRadius: '10px', background: 'var(--bg-primary)', color: 'var(--text-primary)',
    fontSize: 'var(--text-sm)', outline: 'none',
  };

  if (loading) {
    return <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
      <Clock size={20} style={{ animation: 'pulse 1s infinite' }} /> {t('Загрузка…', 'Yuklanmoqda…')}
    </div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 5, display: 'flex', gap: 'var(--space-3)',
        alignItems: 'center', flexWrap: 'wrap', padding: 'var(--space-3)',
        background: 'var(--bg-primary)', borderRadius: '14px', border: '1px solid var(--border)',
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('Поиск настройки…', 'Sozlama qidirish…')}
            style={{ ...inputStyle, paddingLeft: 34 }}
          />
        </div>

        {dirty.length > 0 && (
          <button onClick={() => { setDraft({}); setFieldErrors({}); }} className="btn btn-ghost btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RotateCcw size={14} /> {t('Отменить', 'Bekor qilish')}
          </button>
        )}

        <button onClick={save} disabled={saving || !dirty.length} className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: dirty.length ? 1 : 0.5 }}>
          <Save size={16} />
          {saving
            ? t('Сохранение…', 'Saqlanmoqda…')
            : dirty.length
              ? t(`Сохранить (${dirty.length})`, `Saqlash (${dirty.length})`)
              : t('Сохранить', 'Saqlash')}
        </button>
      </div>

      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: '10px',
          background: msg.type === 'success' ? 'var(--success-bg)' : 'var(--error-bg)',
          color: msg.type === 'success' ? 'var(--success)' : 'var(--error)',
          fontSize: 'var(--text-sm)', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {msg.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          {msg.text}
        </div>
      )}

      {categories.filter(c => grouped.has(c.id)).map(cat => (
        <div key={cat.id} className="card" style={{ padding: 'var(--space-5)', borderRadius: '18px' }}>
          <h3 style={{
            fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)',
            fontSize: 'var(--text-base)', marginBottom: 'var(--space-4)',
          }}>
            {lang === 'ru' ? cat.ru : cat.uz}
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--space-4)' }}>
            {(grouped.get(cat.id) ?? []).map(f => (
              <AdminSettingField
                key={f.key}
                f={f}
                val={current(f)}
                changed={f.key in draft}
                err={fieldErrors[f.key]}
                lang={lang}
                t={t}
                onSetValue={setValue}
              />
            ))}
          </div>
        </div>
      ))}

      <PasswordCard lang={lang} />
    </div>
  );
}

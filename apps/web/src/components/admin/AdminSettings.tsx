'use client';

import { PasswordCard } from './AdminPasswordCard';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, RotateCcw, Save, Search } from 'lucide-react';
import { AdminSettingField } from './AdminSettingField';

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
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);

  const [fields, setFields] = useState<Field[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings', { credentials: 'same-origin' });
      const data = await res.json();
      if (data.status === 'ok') {
        setFields(data.fields);
        setCategories(data.categories);
        setDraft({});
      } else {
        setMsg({ type: 'error', text: data.error || t('Не удалось загрузить', 'Yuklab bo\'lmadi') });
      }
    } catch {
      setMsg({ type: 'error', text: t('Ошибка сети', 'Tarmoq xatosi') });
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => { load(); }, [load]);

  const dirty = Object.keys(draft);

  const save = async () => {
    if (!dirty.length) return;
    setSaving(true);
    setMsg(null);
    setFieldErrors({});
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ settings: draft }),
      });
      const data = await res.json();

      const errCount = Object.keys(data.errors ?? {}).length;
      const okCount = Object.keys(data.applied ?? {}).length;

      if (errCount) setFieldErrors(data.errors);
      if (okCount) {
        setMsg({
          type: errCount ? 'error' : 'success',
          text: errCount
            ? t(`Сохранено ${okCount}, с ошибками ${errCount}`, `${okCount} saqlandi, ${errCount} xato`)
            : t(`Сохранено настроек: ${okCount}`, `${okCount} sozlama saqlandi`),
        });
        await load();
      } else {
        setMsg({ type: 'error', text: t('Ничего не сохранено', 'Hech narsa saqlanmadi') });
      }
    } catch {
      setMsg({ type: 'error', text: t('Ошибка сети', 'Tarmoq xatosi') });
    } finally {
      setSaving(false);
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return fields;
    return fields.filter(f =>
      f.labelRu.toLowerCase().includes(q) ||
      f.labelUz.toLowerCase().includes(q) ||
      f.key.toLowerCase().includes(q));
  }, [fields, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Field[]>();
    for (const f of visible) {
      if (!map.has(f.category)) map.set(f.category, []);
      map.get(f.category)!.push(f);
    }
    return map;
  }, [visible]);

  const current = (f: Field) => (f.key in draft ? draft[f.key] : f.value);
  const setValue = (key: string, value: unknown) => setDraft(d => ({ ...d, [key]: value }));

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

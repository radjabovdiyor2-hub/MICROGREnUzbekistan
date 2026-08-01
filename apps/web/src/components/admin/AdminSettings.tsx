'use client';

import { PasswordCard } from './AdminPasswordCard';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, RotateCcw, Save, Search } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// Настройки бизнеса.
//
// Раньше на этой вкладке была ровно одна работающая вещь — смена пароля,
// и пять строк справочного текста. Всё остальное (доставка, бонусы,
// пороги склада, контакты, баннер) жило константами в коде.
//
// Форма строится из ответа /api/admin/settings: добавили ключ в реестр
// (lib/settings/registry.ts) — поле появилось здесь само.
// ══════════════════════════════════════════════════════════════════════

interface Field {
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

interface Category { id: string; ru: string; uz: string }

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
      {/* Панель действий: липкая, чтобы «Сохранить» был виден на длинной форме */}
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
            {(grouped.get(cat.id) ?? []).map(f => {
              const val = current(f);
              const changed = f.key in draft;
              const err = fieldErrors[f.key];

              return (
                <div key={f.key}>
                  <label style={{
                    fontSize: 'var(--text-xs)', fontWeight: 600, display: 'block', marginBottom: 4,
                    color: changed ? 'var(--brand-primary)' : 'var(--text-muted)',
                  }}>
                    {lang === 'ru' ? f.labelRu : f.labelUz}
                    {f.modified && !changed && (
                      <span title={t('Изменено владельцем', 'Egasi tomonidan o\'zgartirilgan')}
                        style={{ marginLeft: 6, color: 'var(--warning)' }}>•</span>
                    )}
                  </label>

                  {f.type === 'boolean' ? (
                    <button
                      type="button"
                      onClick={() => setValue(f.key, !val)}
                      style={{
                        ...inputStyle, cursor: 'pointer', textAlign: 'left', fontWeight: 600,
                        color: val ? 'var(--success)' : 'var(--text-muted)',
                        borderColor: changed ? 'var(--brand-primary)' : 'var(--border)',
                      }}>
                      {val ? t('Включено', 'Yoqilgan') : t('Выключено', "O'chirilgan")}
                    </button>
                  ) : f.type === 'text' ? (
                    <textarea
                      value={String(val ?? '')}
                      onChange={e => setValue(f.key, e.target.value)}
                      rows={3}
                      style={{ ...inputStyle, resize: 'vertical', borderColor: err ? 'var(--error)' : changed ? 'var(--brand-primary)' : 'var(--border)' }}
                    />
                  ) : f.type === 'list' ? (
                    <input
                      value={Array.isArray(val) ? val.join(', ') : String(val ?? '')}
                      onChange={e => setValue(f.key, e.target.value.split(',').map(s => s.trim()))}
                      style={{ ...inputStyle, borderColor: err ? 'var(--error)' : changed ? 'var(--brand-primary)' : 'var(--border)' }}
                    />
                  ) : (
                    <input
                      type={f.type === 'number' || f.type === 'money' ? 'number' : 'text'}
                      value={String(val ?? '')}
                      min={f.min ?? undefined}
                      max={f.max ?? undefined}
                      onChange={e => setValue(f.key, f.type === 'number' || f.type === 'money'
                        ? e.target.value === '' ? '' : Number(e.target.value)
                        : e.target.value)}
                      style={{ ...inputStyle, borderColor: err ? 'var(--error)' : changed ? 'var(--brand-primary)' : 'var(--border)' }}
                    />
                  )}

                  {err && (
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--error)', marginTop: 4 }}>{err}</p>
                  )}
                  {!err && f.hintRu && lang === 'ru' && (
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>
                      {f.hintRu}
                    </p>
                  )}
                  {!err && changed && (
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 4 }}>
                      {t('Было', 'Oldin')}: <b>{String(f.value)}</b>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <PasswordCard lang={lang} />
    </div>
  );
}

/** Смена пароля — единственное, что было на этой вкладке раньше. */

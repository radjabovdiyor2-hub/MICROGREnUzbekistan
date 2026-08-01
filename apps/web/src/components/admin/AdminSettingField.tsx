'use client';

import React from 'react';
import type { Field } from './AdminSettings';

export function AdminSettingField({
  f,
  val,
  changed,
  err,
  lang,
  t,
  onSetValue,
}: {
  f: Field;
  val: unknown;
  changed: boolean;
  err?: string;
  lang: 'ru' | 'uz';
  t: (ru: string, uz: string) => string;
  onSetValue: (key: string, value: unknown) => void;
}) {
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)',
    borderRadius: '10px', background: 'var(--bg-primary)', color: 'var(--text-primary)',
    fontSize: 'var(--text-sm)', outline: 'none',
  };

  return (
    <div>
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
          onClick={() => onSetValue(f.key, !val)}
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
          onChange={e => onSetValue(f.key, e.target.value)}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical', borderColor: err ? 'var(--error)' : changed ? 'var(--brand-primary)' : 'var(--border)' }}
        />
      ) : f.type === 'list' ? (
        <input
          value={Array.isArray(val) ? val.join(', ') : String(val ?? '')}
          onChange={e => onSetValue(f.key, e.target.value.split(',').map(s => s.trim()))}
          style={{ ...inputStyle, borderColor: err ? 'var(--error)' : changed ? 'var(--brand-primary)' : 'var(--border)' }}
        />
      ) : (
        <input
          type={f.type === 'number' || f.type === 'money' ? 'number' : 'text'}
          value={String(val ?? '')}
          min={f.min ?? undefined}
          max={f.max ?? undefined}
          onChange={e => onSetValue(f.key, f.type === 'number' || f.type === 'money'
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
}

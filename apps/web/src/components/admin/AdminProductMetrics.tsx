'use client';

import type { Dispatch, SetStateAction } from 'react';
import { AlertTriangle, CheckCircle, Tag } from 'lucide-react';

// Полоса показателей каталога: всего, активные, заканчиваются.


interface Props {
  counts: Record<string, number>;
  activeCount: number;
  lowStock: number;
  lang: 'ru' | 'uz';
  setLang: Dispatch<SetStateAction<'ru' | 'uz'>>;
  t: (ru: string, uz: string) => string;
}

export function AdminProductMetrics({ counts, activeCount, lowStock, lang, setLang, t }: Props) {
  return (
    <>
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
    </>
  );
}

'use client';

import { AlertTriangle, CheckCircle, Tag } from 'lucide-react';

// Полоса показателей каталога: всего, активные, заканчиваются.


interface Props {
  counts: { total: number; active: number; archived: number };
  activeCount: number;
  lowStock: number;
  t: (ru: string, uz: string) => string;
}

export function AdminProductMetrics({ counts, activeCount, lowStock, t }: Props) {
  return (
    <>
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
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

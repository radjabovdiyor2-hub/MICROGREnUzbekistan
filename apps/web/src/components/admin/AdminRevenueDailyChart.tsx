'use client';

import React from 'react';
import { TrendingUp } from 'lucide-react';

interface DailyData { date: string; revenue: number; cost: number; profit: number }

interface Props {
  dailyData: DailyData[];
  maxDaily: number;
}

export function AdminRevenueDailyChart({ dailyData, maxDaily }: Props) {
  if (!dailyData || dailyData.length === 0) return null;

  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <h4 style={{ fontWeight: 700, marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-sm)' }}>
        <TrendingUp size={16} /> Ежедневная выручка
      </h4>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 140 }}>
        {dailyData.map((d, i) => {
          const hPct = (d.revenue / maxDaily) * 100;
          const profitPct = d.revenue > 0 ? (d.profit / d.revenue) * 100 : 0;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div style={{ fontSize: '8px', color: 'var(--text-muted)', fontWeight: 700 }}>
                {d.revenue > 0 ? `${(d.revenue / 1000).toFixed(0)}K` : '-'}
              </div>
              <div style={{
                width: '100%', maxWidth: 36, height: `${Math.max(hPct, 4)}%`,
                borderRadius: '4px 4px 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column',
              }}>
                <div style={{ flex: Math.max(profitPct, 0), background: 'var(--success)', minHeight: d.revenue > 0 ? 2 : 0 }} />
                <div style={{ flex: Math.max(100 - profitPct, 0), background: 'var(--error)', opacity: 0.6, minHeight: d.revenue > 0 ? 2 : 0 }} />
              </div>
              <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                {new Date(d.date).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' }).slice(0, 5)}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-4)', justifyContent: 'center', marginTop: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--text-xs)' }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--success)' }} /> Прибыль
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--text-xs)' }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--error)', opacity: 0.6 }} /> Себестоимость
        </div>
      </div>
    </div>
  );
}

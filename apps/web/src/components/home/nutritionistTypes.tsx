import React from 'react';

export interface NutrientDetail {
  nameUz: string;
  nameRu: string;
  grams: number;
  benefits?: Array<{ uz: string; ru: string }>;
}

export interface NutrientResult {
  total: Record<string, number>;
  details: NutrientDetail[];
  dailyValuePercent: Record<string, number>;
}

export const inputStyle: React.CSSProperties = {
  padding: '10px 14px', borderRadius: 12, border: '1.5px solid var(--border)',
  background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13,
  outline: 'none', width: '100%', transition: 'border-color 0.2s',
};

export function DvBar({ label, percent, color }: { label: string; percent: number; color: string }) {
  const capped = Math.min(percent, 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <span style={{ width: 50, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
        <div style={{
          width: `${capped}%`, height: '100%', background: color, borderRadius: 4,
          transition: 'width 0.5s ease',
        }} />
      </div>
      <span style={{ width: 40, textAlign: 'right', fontWeight: 600, color }}>{percent}%</span>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

// Два самостоятельных виджета аналитики: здоровье склада и матрица ABC-XYZ.
// Каждый сам ходит за своими данными, поэтому в теле экрана им делать нечего.

type HealthLevel = 'ok' | 'info' | 'warning' | 'critical';

const HEALTH_COLORS: Record<HealthLevel, string> = {
  ok: 'var(--brand-primary)',
  info: 'var(--info)',
  warning: 'var(--warning)',
  critical: 'var(--error)',
};
export function HealthScoreWidget() {
  const [data, setData] = useState<{
    healthScore: number; healthLabel: string; healthLevel: HealthLevel;
    breakdown: { stockoutScore: number; balanceScore: number; turnoverScore: number; diversityScore: number };
  } | null>(null);

  useEffect(() => {
    fetch('/api/inventory/analytics?section=health').then(r => r.json()).then(setData).catch(console.error);
  }, []);

  if (!data) return <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}><Clock size={24} style={{ animation: 'pulse 1.5s infinite', color: 'var(--text-muted)' }} /></div>;

  const { healthScore, healthLabel, healthLevel, breakdown } = data;
  const healthColor = HEALTH_COLORS[healthLevel] ?? HEALTH_COLORS.ok;
  const circumference = 2 * Math.PI * 45;
  const progress = (healthScore / 100) * circumference;

  return (
    <div className="card" style={{ padding: 'var(--space-4)', textAlign: 'center' }}>
      <h4 style={{ fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
        Ombor salomatligi
      </h4>
      {/* Radial gauge */}
      <div style={{ position: 'relative', width: 120, height: 120, margin: '0 auto var(--space-3)' }}>
        <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="50" cy="50" r="45" fill="none" stroke="var(--bg-tertiary)" strokeWidth="8" />
          <circle cx="50" cy="50" r="45" fill="none" stroke={healthColor} strokeWidth="8"
            strokeDasharray={circumference} strokeDashoffset={circumference - progress}
            strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s ease' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-2xl)', color: healthColor }}>{healthScore}</span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>/100</span>
        </div>
      </div>
      <div style={{ padding: '4px 12px', borderRadius: 'var(--radius-full)', background: `color-mix(in srgb, ${healthColor} 12%, transparent)`, color: healthColor, fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', display: 'inline-block', marginBottom: 'var(--space-3)' }}>
        {healthLabel}
      </div>
      {/* Breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', textAlign: 'left' }}>
        {[
          { label: 'Mavjudlik', score: breakdown.stockoutScore, max: 25 },
          { label: 'Balans', score: breakdown.balanceScore, max: 25 },
          { label: 'Aylanma', score: breakdown.turnoverScore, max: 25 },
          { label: 'Xilma-xillik', score: breakdown.diversityScore, max: 25 },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', width: 70 }}>{item.label}</span>
            <div style={{ flex: 1, height: 4, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(item.score / item.max) * 100}%`, background: healthColor, borderRadius: 'var(--radius-full)' }} />
            </div>
            <span style={{ fontSize: '10px', fontWeight: 'var(--font-bold)', width: 30, textAlign: 'right' }}>{item.score}/{item.max}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// ABC-XYZ Matrix Widget
// ==========================================
export function ABCXYZWidget() {
  const [data, setData] = useState<{ classSummary: Record<string, number>; totalRevenue: number } | null>(null);

  useEffect(() => {
    fetch('/api/inventory/analytics?section=abcxyz').then(r => r.json()).then(setData).catch(console.error);
  }, []);

  if (!data) return <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}><Clock size={24} style={{ animation: 'pulse 1.5s infinite', color: 'var(--text-muted)' }} /></div>;

  const { classSummary } = data;
  // Девять классов ABC-XYZ должны читаться как девять РАЗНЫХ ячеек, поэтому
  // здесь категориальная палитра --cat-*, а не статусные --success/--warning:
  // те дали бы одинаковый цвет соседним классам и матрица потеряла бы смысл.
  const matrixColors: Record<string, string> = {
    AX: 'var(--cat-10)', AY: 'var(--cat-7)', AZ: 'var(--cat-12)',
    BX: 'var(--cat-5)', BY: 'var(--cat-1)', BZ: 'var(--cat-4)',
    CX: 'var(--cat-6)', CY: 'var(--cat-2)', CZ: 'var(--cat-8)',
  };
  const matrixLabels: Record<string, string> = {
    AX: 'Ideal', AY: 'Yaxshi', AZ: 'Ehtiyot',
    BX: 'Stabil', BY: "O'rtacha", BZ: 'Beqaror',
    CX: 'Kam daromad', CY: 'Zaif', CZ: 'Xavfli',
  };

  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <h4 style={{ fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
        ABC-XYZ Matritsa
      </h4>
      {/* Обёртка прокрутки: четыре колонки с суммами не помещаются на телефоне,
          а .admin-main их бы просто срезал. */}
      <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', gap: 2, minWidth: 320 }}>
        {/* Header */}
        <div />
        {['X', 'Y', 'Z'].map(x => (
          <div key={x} style={{ textAlign: 'center', fontSize: '10px', fontWeight: 'var(--font-bold)', color: 'var(--text-muted)', padding: '4px' }}>{x}</div>
        ))}
        {/* Rows */}
        {['A', 'B', 'C'].map(abc => (
          <>
            <div key={`label-${abc}`} style={{ fontSize: '10px', fontWeight: 'var(--font-bold)', color: 'var(--text-muted)', padding: '8px 6px', display: 'flex', alignItems: 'center' }}>{abc}</div>
            {['X', 'Y', 'Z'].map(xyz => {
              const cls = `${abc}${xyz}`;
              const count = classSummary[cls] || 0;
              return (
                <div key={cls} style={{
                  background: count > 0 ? `${matrixColors[cls]}20` : 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-sm)', padding: 'var(--space-2)',
                  textAlign: 'center', border: count > 0 ? `1px solid ${matrixColors[cls]}40` : '1px solid transparent',
                }}>
                  <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-sm)', color: matrixColors[cls] }}>{count}</div>
                  <div style={{ fontSize: '8px', color: 'var(--text-muted)' }}>{matrixLabels[cls]}</div>
                </div>
              );
            })}
          </>
        ))}
      </div>
      </div>
      <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        <b>A</b> = yuqori daromad, <b>B</b> = o&apos;rtacha, <b>C</b> = past<br />
        <b>X</b> = barqaror talab, <b>Y</b> = o&apos;zgaruvchan, <b>Z</b> = beqaror
      </div>
    </div>
  );
}

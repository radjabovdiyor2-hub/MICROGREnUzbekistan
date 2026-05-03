'use client';

import { useState, useEffect } from 'react';
import * as Icons from '@/components/ui/Icons';

interface MonthData { month: string; orders: number; revenue: number; posRevenue: number; posSales: number; }
interface TopProduct { id: string; nameUz: string; price: number; stock: number; sold: number; revenue: number; category?: { nameUz: string }; }
interface CategoryData { id: string; name: string; totalProducts: number; totalStock: number; stockValue: number; totalSold: number; totalRevenue: number; }
interface Warning { level: string; message: string; action: string; }

export function AdminAnalytics() {
  const [monthlyData, setMonthlyData] = useState<MonthData[]>([]);
  const [topBySales, setTopBySales] = useState<TopProduct[]>([]);
  const [topByRevenue, setTopByRevenue] = useState<TopProduct[]>([]);
  const [deadStock, setDeadStock] = useState<TopProduct[]>([]);
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [loading, setLoading] = useState(true);
  const [topView, setTopView] = useState<'sales' | 'revenue' | 'dead'>('sales');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [salesRes, topRes, catRes, warnRes] = await Promise.all([
          fetch('/api/inventory/analytics?section=sales&months=6'),
          fetch('/api/inventory/analytics?section=top'),
          fetch('/api/inventory/analytics?section=categories'),
          fetch('/api/inventory/analytics?section=warnings'),
        ]);
        const [salesData, topData, catData, warnData] = await Promise.all([
          salesRes.json(), topRes.json(), catRes.json(), warnRes.json()
        ]);
        setMonthlyData(salesData.monthlyData || []);
        setTopBySales(topData.topBySales || []);
        setTopByRevenue(topData.topByRevenue || []);
        setDeadStock(topData.deadStock || []);
        setCategories(catData.categories || []);
        setWarnings(warnData.warnings || []);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
        <Icons.Clock size={32} style={{ animation: 'pulse 1.5s infinite' }} />
        <p style={{ marginTop: 'var(--space-2)' }}>Analitika yuklanmoqda...</p>
      </div>
    );
  }

  const maxRevenue = Math.max(...monthlyData.map(d => d.revenue + d.posRevenue), 1);
  const totalCatRevenue = categories.reduce((s, c) => s + c.totalRevenue, 0);
  const catColors = ['#6366F1', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EF4444', '#14B8A6'];

  const currentTopList = topView === 'sales' ? topBySales : topView === 'revenue' ? topByRevenue : deadStock;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <style>{`
        .analytics-grid-2col { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
        @media (max-width: 640px) { .analytics-grid-2col { grid-template-columns: 1fr; } }
      `}</style>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="card" style={{ padding: 'var(--space-4)', borderLeft: '3px solid var(--error)' }}>
          <h4 style={{ fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--error)' }}>
            <Icons.AlertTriangle size={16} /> Ogohlantirishlar ({warnings.length})
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            {warnings.slice(0, 5).map((w, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-1) 0', fontSize: 'var(--text-sm)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 'var(--radius-full)', background: w.level === 'CRITICAL' ? 'var(--error)' : '#F59E0B', flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{w.message}</span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--brand-primary)', fontWeight: 'var(--font-medium)' }}>{w.action}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Monthly Sales Chart (CSS bar chart) */}
      <div className="card" style={{ padding: 'var(--space-4)' }}>
        <h4 style={{ fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Icons.BarChart size={16} /> Oylik savdolar
        </h4>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-2)', height: 180, padding: '0 var(--space-2)' }}>
          {monthlyData.map((d, i) => {
            const totalRev = d.revenue + d.posRevenue;
            const heightPct = (totalRev / maxRevenue) * 100;
            const onlinePct = totalRev > 0 ? (d.revenue / totalRev) * 100 : 50;

            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                {/* Value */}
                <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 'var(--font-bold)', whiteSpace: 'nowrap' }}>
                  {totalRev > 1000000 ? `${(totalRev / 1000000).toFixed(1)}M` : totalRev > 0 ? `${Math.round(totalRev / 1000)}K` : '-'}
                </div>
                {/* Bar */}
                <div style={{ width: '100%', maxWidth: 48, height: `${Math.max(heightPct, 4)}%`, borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ flex: onlinePct, background: 'var(--brand-primary)', minHeight: totalRev > 0 ? 2 : 0 }} />
                  <div style={{ flex: 100 - onlinePct, background: 'var(--success)', minHeight: totalRev > 0 ? 2 : 0 }} />
                </div>
                {/* Label */}
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 4 }}>
                  {d.month.split(' ')[0]}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-4)', justifyContent: 'center', marginTop: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--text-xs)' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--brand-primary)' }} /> Online
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--text-xs)' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--success)' }} /> Do&apos;kon
          </div>
        </div>
      </div>

      {/* Two columns: Top Products + Categories */}
      <div className="analytics-grid-2col">

        {/* Top Products */}
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-1)', marginBottom: 'var(--space-3)' }}>
            {([['sales', 'Top sotish'], ['revenue', 'Top tushum'], ['dead', "O'lik tovar"]] as const).map(([key, label]) => (
              <button key={key} onClick={() => setTopView(key)} className={`btn btn-sm ${topView === key ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: 'var(--text-xs)' }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            {currentTopList.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--space-4)' }}>Ma&apos;lumot yo&apos;q</p>
            ) : (
              currentTopList.map((p, i) => {
                const maxSold = Math.max(...currentTopList.map(x => topView === 'revenue' ? x.revenue : x.sold), 1);
                const val = topView === 'revenue' ? p.revenue : p.sold;
                const pct = (val / maxSold) * 100;

                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-1) 0' }}>
                    <span style={{ width: 18, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textAlign: 'right', fontWeight: 'var(--font-bold)' }}>{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: 2 }}>{p.nameUz}</div>
                      <div style={{ height: 4, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: topView === 'dead' ? 'var(--error)' : 'var(--brand-primary)', borderRadius: 'var(--radius-full)' }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', color: topView === 'dead' ? 'var(--error)' : 'var(--text-primary)', minWidth: 50, textAlign: 'right' }}>
                      {topView === 'revenue' ? `${fmt(p.revenue)}` : topView === 'dead' ? `${p.stock} dona` : `${p.sold} dona`}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Categories */}
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <h4 style={{ fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
            Kategoriyalar
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {categories.map((cat, i) => {
              const pct = totalCatRevenue > 0 ? (cat.totalRevenue / totalCatRevenue) * 100 : 0;
              return (
                <div key={cat.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', marginBottom: 2 }}>
                    <span style={{ fontWeight: 'var(--font-medium)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: catColors[i % catColors.length], flexShrink: 0 }} />
                      {cat.name}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>{fmt(cat.totalRevenue)} ({pct.toFixed(0)}%)</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: catColors[i % catColors.length], borderRadius: 'var(--radius-full)', transition: 'width 0.5s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Health Score + ABC-XYZ + Export */}
      <div className="analytics-grid-2col">

        {/* Health Score */}
        <HealthScoreWidget />

        {/* ABC-XYZ Matrix */}
        <ABCXYZWidget />
      </div>

      {/* Export Buttons */}
      <div className="card" style={{ padding: 'var(--space-4)' }}>
        <h4 style={{ fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-sm)' }}>
          <Icons.Download size={16} /> Hisobotlar yuklab olish (CSV)
        </h4>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {[
            { type: 'inventory', label: 'Ombor hisoboti', icon: <Icons.Package size={14} /> },
            { type: 'debts', label: 'Qarzlar hisoboti', icon: <Icons.CreditCard size={14} /> },
            { type: 'movements', label: 'Harakatlar tarixi', icon: <Icons.ClipboardList size={14} /> },
            { type: 'sales', label: 'Sotishlar (30 kun)', icon: <Icons.BarChart size={14} /> },
          ].map(exp => (
            <a key={exp.type} href={`/api/inventory/export?type=${exp.type}`} download
              className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {exp.icon} {exp.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// Health Score Widget
// ==========================================
function HealthScoreWidget() {
  const [data, setData] = useState<{
    healthScore: number; healthLabel: string; healthColor: string;
    breakdown: { stockoutScore: number; balanceScore: number; turnoverScore: number; diversityScore: number };
  } | null>(null);

  useEffect(() => {
    fetch('/api/inventory/analytics?section=health').then(r => r.json()).then(setData).catch(console.error);
  }, []);

  if (!data) return <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}><Icons.Clock size={24} style={{ animation: 'pulse 1.5s infinite', color: 'var(--text-muted)' }} /></div>;

  const { healthScore, healthLabel, healthColor, breakdown } = data;
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
      <div style={{ padding: '4px 12px', borderRadius: 'var(--radius-full)', background: `${healthColor}15`, color: healthColor, fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', display: 'inline-block', marginBottom: 'var(--space-3)' }}>
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
function ABCXYZWidget() {
  const [data, setData] = useState<{ classSummary: Record<string, number>; totalRevenue: number } | null>(null);

  useEffect(() => {
    fetch('/api/inventory/analytics?section=abcxyz').then(r => r.json()).then(setData).catch(console.error);
  }, []);

  if (!data) return <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}><Icons.Clock size={24} style={{ animation: 'pulse 1.5s infinite', color: 'var(--text-muted)' }} /></div>;

  const { classSummary } = data;
  const matrixColors: Record<string, string> = {
    AX: '#10B981', AY: '#34D399', AZ: '#6EE7B7',
    BX: '#3B82F6', BY: '#60A5FA', BZ: '#93C5FD',
    CX: '#F59E0B', CY: '#FBBF24', CZ: '#EF4444',
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
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', gap: 2 }}>
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
      <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        <b>A</b> = yuqori daromad, <b>B</b> = o&apos;rtacha, <b>C</b> = past<br />
        <b>X</b> = barqaror talab, <b>Y</b> = o&apos;zgaruvchan, <b>Z</b> = beqaror
      </div>
    </div>
  );
}

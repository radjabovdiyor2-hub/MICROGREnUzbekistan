'use client';

import { useState, useEffect } from 'react';
import * as Icons from '@/components/ui/Icons';

interface RevenueData {
  todayRevenue: number;
  todayCost: number;
  todayProfit: number;
  todayMargin: number;
  todaySales: number;
  weekRevenue: number;
  weekCost: number;
  weekProfit: number;
  monthRevenue: number;
  monthCost: number;
  monthProfit: number;
  monthMargin: number;
  dailyData: { date: string; revenue: number; cost: number; profit: number }[];
  topProfitable: { name: string; revenue: number; cost: number; profit: number; margin: number; sold: number }[];
  topLoss: { name: string; revenue: number; cost: number; profit: number; margin: number; sold: number }[];
}

export function AdminRevenue() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'week' | 'month'>('week');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/inventory/analytics?section=revenue&period=${period}`);
        const d = await res.json();
        setData(d);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    load();
  }, [period]);

  const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
        <Icons.Clock size={32} style={{ animation: 'pulse 1.5s infinite' }} />
        <p style={{ marginTop: 'var(--space-2)' }}>Tushum yuklanmoqda...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
        <Icons.DollarSign size={48} style={{ opacity: 0.3, marginBottom: 'var(--space-2)' }} />
        <p>Ma&apos;lumot topilmadi</p>
        <p style={{ fontSize: 'var(--text-xs)', marginTop: 4 }}>Sotish va kirim harakatlari bo&apos;lgandan keyin tushum ko&apos;rinadi</p>
      </div>
    );
  }

  const periodData = period === 'week'
    ? { revenue: data.weekRevenue, cost: data.weekCost, profit: data.weekProfit }
    : { revenue: data.monthRevenue, cost: data.monthCost, profit: data.monthProfit };
  const periodMargin = periodData.revenue > 0 ? ((periodData.profit / periodData.revenue) * 100) : 0;

  const maxDaily = Math.max(...(data.dailyData || []).map(d => d.revenue), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <style>{`
        .rev-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-2); }
        .rev-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
        @media (max-width: 768px) {
          .rev-grid { grid-template-columns: repeat(2, 1fr); }
          .rev-grid-2 { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* Today KPIs */}
      <div className="rev-grid">
        {[
          { label: 'Bugungi tushum', value: fmt(data.todayRevenue), icon: <Icons.Banknote size={18} />, color: 'var(--brand-primary)', sub: `${data.todaySales} ta sotish` },
          { label: 'Tan narxi (kirim)', value: fmt(data.todayCost), icon: <Icons.ArrowLeft size={18} />, color: 'var(--error)', sub: 'Yetkazuvchi narxi' },
          { label: 'Sof foyda', value: fmt(data.todayProfit), icon: <Icons.TrendingUp size={18} />, color: data.todayProfit >= 0 ? 'var(--success)' : 'var(--error)', sub: `${data.todayMargin.toFixed(1)}% marja` },
          { label: 'Marja', value: `${data.todayMargin.toFixed(1)}%`, icon: <Icons.Percent size={18} />, color: data.todayMargin >= 20 ? 'var(--success)' : data.todayMargin >= 10 ? '#F59E0B' : 'var(--error)', sub: data.todayMargin >= 20 ? 'Yaxshi' : 'Past' },
        ].map((stat, i) => (
          <div key={i} className="card" style={{ padding: 'var(--space-3)', borderTop: `3px solid ${stat.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
              <div style={{ width: 34, height: 34, borderRadius: '10px', background: `${stat.color}15`, color: stat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {stat.icon}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.2 }}>{stat.label}</div>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'var(--text-base)', color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 2 }}>{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* Period selector + summary */}
      <div className="card" style={{ padding: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          <h4 style={{ fontWeight: 700, flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icons.BarChart size={16} /> Davr bo&apos;yicha
          </h4>
          <div style={{ display: 'flex', gap: 2, background: 'var(--bg-secondary)', borderRadius: '10px', padding: 2 }}>
            {(['week', 'month'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                fontSize: 'var(--text-xs)', fontWeight: 700,
                background: period === p ? 'var(--brand-primary)' : 'transparent',
                color: period === p ? 'white' : 'var(--text-secondary)',
                transition: 'all 0.2s',
              }}>
                {p === 'week' ? 'Hafta' : 'Oy'}
              </button>
            ))}
          </div>
        </div>

        {/* Period summary bars */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
          {[
            { label: 'Tushum', value: periodData.revenue, color: 'var(--brand-primary)' },
            { label: 'Tan narx', value: periodData.cost, color: 'var(--error)' },
            { label: 'Foyda', value: periodData.profit, color: 'var(--success)' },
          ].map((item, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: item.color, fontSize: 'var(--text-sm)' }}>
                {fmt(item.value)}
              </div>
            </div>
          ))}
        </div>

        {/* Margin gauge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: '12px' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600, width: 60 }}>Marja</span>
          <div style={{ flex: 1, height: 8, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${Math.min(periodMargin, 100)}%`, borderRadius: 'var(--radius-full)',
              background: periodMargin >= 20 ? 'var(--success)' : periodMargin >= 10 ? '#F59E0B' : 'var(--error)',
              transition: 'width 0.5s',
            }} />
          </div>
          <span style={{ fontWeight: 800, fontSize: 'var(--text-sm)', color: periodMargin >= 20 ? 'var(--success)' : periodMargin >= 10 ? '#F59E0B' : 'var(--error)', minWidth: 45, textAlign: 'right' }}>
            {periodMargin.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Daily chart */}
      {data.dailyData && data.dailyData.length > 0 && (
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <h4 style={{ fontWeight: 700, marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-sm)' }}>
            <Icons.TrendingUp size={16} /> Kunlik tushum
          </h4>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 140 }}>
            {data.dailyData.map((d, i) => {
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
              <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--success)' }} /> Foyda
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--text-xs)' }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--error)', opacity: 0.6 }} /> Tan narx
            </div>
          </div>
        </div>
      )}

      {/* Top profitable & loss products */}
      <div className="rev-grid-2">
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <h4 style={{ fontWeight: 700, marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--success)' }}>
            <Icons.TrendingUp size={14} /> Eng foydali tovarlar
          </h4>
          {(!data.topProfitable || data.topProfitable.length === 0) ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', textAlign: 'center', padding: 'var(--space-4)' }}>
              Tan narxi kiritilgan sotishlar kerak
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              {data.topProfitable.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ width: 20, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 700, textAlign: 'right' }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{p.sold} dona · {p.margin.toFixed(0)}% marja</div>
                  </div>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: 'var(--success)', minWidth: 55, textAlign: 'right' }}>+{fmt(p.profit)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <h4 style={{ fontWeight: 700, marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--error)' }}>
            <Icons.TrendingDown size={14} /> Kam foydali tovarlar
          </h4>
          {(!data.topLoss || data.topLoss.length === 0) ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', textAlign: 'center', padding: 'var(--space-4)' }}>
              Ma&apos;lumot yo&apos;q
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              {data.topLoss.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ width: 20, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 700, textAlign: 'right' }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{p.sold} dona · {p.margin.toFixed(0)}% marja</div>
                  </div>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: p.profit < 0 ? 'var(--error)' : '#F59E0B', minWidth: 55, textAlign: 'right' }}>{fmt(p.profit)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

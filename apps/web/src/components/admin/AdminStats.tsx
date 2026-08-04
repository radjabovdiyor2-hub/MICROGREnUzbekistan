'use client';

import { AdminStatsRevenue } from './AdminStatsRevenue';
import { AdminGrowSummary } from './AdminGrowSummary';

import { useState, useEffect } from 'react';
import {
  Banknote, RefreshCw, ShoppingCart, TrendingUp,
} from 'lucide-react';

import { type StatsData } from './statsTypes';
export type { StatsData };

export function AdminStats() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        // Один источник на весь экран. Раньше здесь склеивались четыре
        // эндпоинта: /api/orders (без limit — то есть первые 20 заказов),
        // /api/products, /api/inventory/pos (сутки по UTC) и аналитика
        // (сутки по местному времени). Числа на соседних плитках считались
        // по разным данным за разные сутки и сойтись не могли.
        const res = await fetch('/api/inventory/analytics?section=revenue');
        const d = await res.json();

        setStats({
          todayTotalRevenue: d.todayRevenue || 0,
          todayGoodsPos: d.todayGoodsPos || 0,
          todayGoodsOnline: d.todayGoodsOnline || 0,
          todayDeliveryFees: d.todayDelivery || 0,
          todayDiscount: d.todayDiscount || 0,
          todayReturns: d.todayReturns || 0,
          todayCost: d.todayCost || 0,
          todayProfit: d.todayProfit || 0,
          todayMargin: d.todayMargin || 0,
          todayOrders: d.todayOrders || 0,
          todayPOSSales: d.todayPosSales || 0,
          todayReturnCount: d.todayReturnCount || 0,
          todayUnits: d.todayUnits || 0,
          todayAverageCheck: d.todayAverageCheck || 0,
          monthRevenue: d.monthRevenue || 0,
          monthOrders: d.monthOrders || 0,
          monthGoodsOnline: d.monthGoodsOnline || 0,
          pendingOrders: d.pendingOrders || 0,
          deliveringOrders: d.deliveringOrders || 0,
          activeProducts: d.activeProducts || 0,
        });
      } catch (err) {
        console.error('Stats fetch error:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

  const STAT_CARDS = [
    { label: 'Выручка за сегодня', value: `${fmt(stats?.todayTotalRevenue || 0)}`, icon: <Banknote size={22} />, color: 'var(--success)' },
    { label: 'Чистая прибыль', value: `${fmt(stats?.todayProfit || 0)}`, icon: <TrendingUp size={22} />, color: (stats?.todayProfit || 0) >= 0 ? 'var(--success)' : 'var(--error)' },
    { label: 'POS продаж', value: `${stats?.todayPOSSales || 0} шт`, icon: <ShoppingCart size={22} />, color: 'var(--brand-primary)' },
    { label: 'Возвраты', value: stats?.todayReturnCount ? `-${fmt(stats.todayReturns)}` : '0', icon: <RefreshCw size={22} />, color: stats?.todayReturnCount ? 'var(--error)' : 'var(--text-muted)' },
  ];

  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-3)' }}>
        {[1,2,3,4].map(i => (
          <div key={i} className="card" style={{ padding: 'var(--space-4)', animation: 'pulse 1.5s infinite' }}>
            <div style={{ height: 50, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        {STAT_CARDS.map((stat, i) => (
          <div key={i} className="card" style={{
            padding: 'var(--space-3) var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
          }}>
            <div style={{
              width: 42, height: 42, borderRadius: 'var(--radius-md)',
              background: `color-mix(in srgb, ${stat.color} 12%, transparent)`, color: stat.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {stat.icon}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.2, marginBottom: 2 }}>{stat.label}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-base)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {stat.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      <AdminStatsRevenue
        stats={stats}
        fmt={fmt}
      />
      <AdminGrowSummary fmt={fmt} />
    </div>
  );
}

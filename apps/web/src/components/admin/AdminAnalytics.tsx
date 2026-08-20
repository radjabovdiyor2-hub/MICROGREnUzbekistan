'use client';

import { HealthScoreWidget, ABCXYZWidget } from './AdminAnalyticsWidgets';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Clock,
} from 'lucide-react';

interface MonthData { month: string; orders: number; revenue: number; posRevenue: number; posSales: number; }
interface TopProduct { id: string; nameUz: string; price: number; stock: number; sold: number; revenue: number; category?: { nameUz: string }; }
interface CategoryData { id: string; name: string; totalProducts: number; totalStock: number; stockValue: number; totalSold: number; totalRevenue: number; }
interface Warning { level: string; message: string; action: string; }

import { WarningsWidget, MonthlyChart, ExportWidget } from './AdminAnalyticsCharts';

export function AdminAnalytics() {
  const [topView, setTopView] = useState<'sales' | 'revenue' | 'dead'>('sales');

  // Четыре среза одного экрана — одним запросом кэша. Разделять их по
  // ключам смысла нет: показываются они вместе и устаревают вместе.
  const { data, isPending: loading } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: async () => {
      const sections = ['sales&months=6', 'top', 'categories', 'warnings'];
      const [salesData, topData, catData, warnData] = await Promise.all(
        sections.map(async (section) => {
          const res = await fetch(`/api/inventory/analytics?section=${section}`);
          if (!res.ok) throw new Error('Не удалось загрузить аналитику');
          return res.json();
        }),
      );
      return {
        monthlyData: (salesData.monthlyData || []) as MonthData[],
        topBySales: (topData.topBySales || []) as TopProduct[],
        topByRevenue: (topData.topByRevenue || []) as TopProduct[],
        deadStock: (topData.deadStock || []) as TopProduct[],
        categories: (catData.categories || []) as CategoryData[],
        warnings: (warnData.warnings || []) as Warning[],
      };
    },
  });
  const monthlyData = data?.monthlyData ?? [];
  const topBySales = data?.topBySales ?? [];
  const topByRevenue = data?.topByRevenue ?? [];
  const deadStock = data?.deadStock ?? [];
  const categories = data?.categories ?? [];
  const warnings = data?.warnings ?? [];

  const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
        <Clock size={32} style={{ animation: 'pulse 1.5s infinite' }} />
        <p style={{ marginTop: 'var(--space-2)' }}>Analitika yuklanmoqda...</p>
      </div>
    );
  }

  const maxRevenue = Math.max(...monthlyData.map(d => d.revenue + d.posRevenue), 1);
  const totalCatRevenue = categories.reduce((s, c) => s + c.totalRevenue, 0);
  const catColors = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)', 'var(--cat-6)', 'var(--cat-7)', 'var(--cat-8)'];

  const currentTopList = topView === 'sales' ? topBySales : topView === 'revenue' ? topByRevenue : deadStock;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <style>{`
        .analytics-grid-2col { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
        @media (max-width: 640px) { .analytics-grid-2col { grid-template-columns: 1fr; } }
      `}</style>

      <WarningsWidget warnings={warnings} />
      <MonthlyChart monthlyData={monthlyData} maxRevenue={maxRevenue} />

      {/* Two columns: Top Products + Categories */}
      <div className="analytics-grid-2col">

        {/* Top Products */}
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-1)', overflowX: 'auto', paddingBottom: 2, marginBottom: 'var(--space-3)' }}>
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

      <div className="analytics-grid-2col">
        <HealthScoreWidget />
        <ABCXYZWidget />
      </div>

      <ExportWidget />
    </div>
  );
}

// ==========================================
// Health Score Widget
// ==========================================

/** Уровень здоровья склада приходит с API; цвет для него выбирает витрина
 *  по токенам дизайн-системы, чтобы индикатор жил в теме, а не в hex. */

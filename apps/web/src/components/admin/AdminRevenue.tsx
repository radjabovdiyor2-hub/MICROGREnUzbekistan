'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Banknote, BarChart, Clock, DollarSign, Percent, TrendingUp,
} from 'lucide-react';

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

import { AdminRevenueDailyChart } from './AdminRevenueDailyChart';
import { AdminRevenueTopProducts } from './AdminRevenueTopProducts';
import { tint } from '@/lib/tint';

export function AdminRevenue() {
  const [period, setPeriod] = useState<'week' | 'month'>('week');

  // Период входит в ключ кэша: переключение «неделя ↔ месяц» второй раз
  // рисуется мгновенно из кэша, а не перезапрашивает агрегат заново.
  const { data = null, isPending: loading } = useQuery<RevenueData>({
    queryKey: ['admin-revenue', period],
    queryFn: async () => {
      const res = await fetch(`/api/inventory/analytics?section=revenue&period=${period}`);
      if (!res.ok) throw new Error('Не удалось загрузить доход');
      return res.json();
    },
  });

  const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
        <Clock size={32} style={{ animation: 'pulse 1.5s infinite' }} />
        <p style={{ marginTop: 'var(--space-2)' }}>Загрузка дохода...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
        <DollarSign size={48} style={{ opacity: 0.3, marginBottom: 'var(--space-2)' }} />
        <p>Данные не найдены</p>
        <p style={{ fontSize: 'var(--text-xs)', marginTop: 4 }}>Доход появится после продаж и поступлений</p>
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
          { label: 'Выручка сегодня', value: fmt(data.todayRevenue), icon: <Banknote size={18} />, color: 'var(--brand-primary)', sub: `${data.todaySales} продаж` },
          { label: 'Себестоимость', value: fmt(data.todayCost), icon: <ArrowLeft size={18} />, color: 'var(--error)', sub: 'Цена поставщика' },
          { label: 'Чистая прибыль', value: fmt(data.todayProfit), icon: <TrendingUp size={18} />, color: data.todayProfit >= 0 ? 'var(--success)' : 'var(--error)', sub: `${data.todayMargin.toFixed(1)}% маржа` },
          { label: 'Маржа', value: `${data.todayMargin.toFixed(1)}%`, icon: <Percent size={18} />, color: data.todayMargin >= 20 ? 'var(--success)' : data.todayMargin >= 10 ? 'var(--warning)' : 'var(--error)', sub: data.todayMargin >= 20 ? 'Хорошо' : 'Низкая' },
        ].map((stat, i) => (
          <div key={i} className="card" style={{ padding: 'var(--space-3)', borderTop: `3px solid ${stat.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
              <div style={{ width: 34, height: 34, borderRadius: '10px', background: tint(stat.color), color: stat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
            <BarChart size={16} /> По периоду
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
                {p === 'week' ? 'Неделя' : 'Месяц'}
              </button>
            ))}
          </div>
        </div>

        {/* Period summary bars */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
          {[
            { label: 'Выручка', value: periodData.revenue, color: 'var(--brand-primary)' },
            { label: 'Себест.', value: periodData.cost, color: 'var(--error)' },
            { label: 'Прибыль', value: periodData.profit, color: 'var(--success)' },
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
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600, width: 60 }}>Маржа</span>
          <div style={{ flex: 1, height: 8, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${Math.min(periodMargin, 100)}%`, borderRadius: 'var(--radius-full)',
              background: periodMargin >= 20 ? 'var(--success)' : periodMargin >= 10 ? 'var(--warning)' : 'var(--error)',
              transition: 'width 0.5s',
            }} />
          </div>
          <span style={{ fontWeight: 800, fontSize: 'var(--text-sm)', color: periodMargin >= 20 ? 'var(--success)' : periodMargin >= 10 ? 'var(--warning)' : 'var(--error)', minWidth: 45, textAlign: 'right' }}>
            {periodMargin.toFixed(1)}%
          </span>
        </div>
      </div>

      <AdminRevenueDailyChart dailyData={data.dailyData} maxDaily={maxDaily} />
      <AdminRevenueTopProducts topProfitable={data.topProfitable} topLoss={data.topLoss} fmt={fmt} />
    </div>
  );
}

'use client';

import type { InventoryProduct, Summary } from './adminInventoryTypes';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, Banknote, BarChart, Clock, CreditCard, Search,
} from 'lucide-react';

import { STATUS_CONFIG, stockLabel } from './adminInventoryConfig';
import { tint } from '@/lib/tint';

export function AdminInventory({ lang = 'ru' }: { lang?: 'ru' | 'uz' }) {
  // Экран был одноязычным: подписи только на узбекском, при том что
  // кнопка переключения языка в сайдбаре есть и здесь ничего не меняла.
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading: loading } = useQuery({
    queryKey: ['admin-inventory', filter, debouncedSearch],
    queryFn: async () => {
      let url = '/api/inventory?';
      if (filter !== 'all') url += `filter=${filter}&`;
      if (debouncedSearch) url += `search=${encodeURIComponent(debouncedSearch)}&`;
      const res = await fetch(url);
      const data = await res.json();
      return { products: data.products || [], summary: data.summary || null };
    }
  });

  const products: InventoryProduct[] = data?.products || [];
  const summary: Summary | null = data?.summary || null;

  const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

  return (
    <div>
      {/* KPI Cards */}
      {summary && (
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
            {[
              { label: t('Стоимость склада', 'Ombor qiymati'), value: `${fmt(summary.totalStockValue)}`, icon: <Banknote size={16} />, color: 'var(--brand-primary)' },
              { label: t('Продажи сегодня', 'Bugungi savdo'), value: `${fmt(summary.todayRevenue)}`, icon: <BarChart size={16} />, color: 'var(--success)' },
              { label: t('Долги', 'Qarzlar'), value: `${fmt(summary.debtsOwedToUs)}`, icon: <CreditCard size={16} />, color: 'var(--info)' },
            ].map((stat, i) => (
              <div key={i} className="card" style={{ padding: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', background: tint(stat.color), color: stat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {stat.icon}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.2 }}>{stat.label}</div>
                  <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stat.value}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-2)' }}>
            <div className="card" style={{ padding: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', background: 'var(--error-bg)', color: 'var(--error)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertTriangle size={16} />
              </div>
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t('Критично', 'Kritik')}</div>
                <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-sm)', color: 'var(--error)' }}>{summary.criticalCount}</div>
              </div>
            </div>
            <div className="card" style={{ padding: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', background: 'var(--warning-bg)', color: 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertTriangle size={16} />
              </div>
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t('Мало осталось', 'Kam qolgan')}</div>
                <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-sm)', color: 'var(--warning)' }}>{summary.lowCount}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { id: 'all', label: t('Все', 'Barchasi'), count: summary?.totalProducts },
          { id: 'low', label: t('Мало', 'Kam'), count: (summary?.criticalCount || 0) + (summary?.lowCount || 0) },
          { id: 'excess', label: t('Избыток', 'Ortiqcha'), count: summary?.excessCount },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`btn btn-sm ${filter === f.id ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 'var(--text-xs)' }}>
            {f.label} {f.count !== undefined && <span style={{ opacity: 0.7 }}>({f.count})</span>}
          </button>
        ))}
        <div style={{ flex: '1 1 100%', marginTop: 'var(--space-1)' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input type="text" placeholder={t('Поиск…', 'Qidirish…')} value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: 'var(--space-2) var(--space-2) var(--space-2) 32px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }} />
          </div>
        </div>
      </div>

      {/* Products Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
          <Clock size={32} style={{ animation: 'pulse 1.5s infinite' }} />
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <style>{`
            .inv-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
            .inv-table th, .inv-table td { padding: var(--space-2) var(--space-3); }
            .inv-table th { text-align: left; font-weight: var(--font-semibold); color: var(--text-muted); font-size: var(--text-xs); }
            .inv-table-stock { text-align: center; }
            .inv-table-val { text-align: right; }
            @media (max-width: 640px) {
              .inv-hide-mobile { display: none; }
              .inv-table th, .inv-table td { padding: var(--space-2); font-size: var(--text-xs); }
            }
          `}</style>
          <div style={{ overflowX: 'auto' }}>
            <table className="inv-table">
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th>{t('Товар', 'Tovar')}</th>
                  <th className="inv-table-stock">{t('Склад', 'Ombor')}</th>
                  <th className="inv-hide-mobile inv-table-stock">{t('В день', 'Kunlik')}</th>
                  <th className="inv-table-stock">{t('Хватит на', 'Qolgan')}</th>
                  <th className="inv-table-stock">{t('Состояние', 'Holat')}</th>
                  <th className="inv-hide-mobile inv-table-val">{t('Сумма', 'Qiymat')}</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => {
                  const st = STATUS_CONFIG[p.status] || STATUS_CONFIG.NORMAL;
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td>
                        <div style={{ fontWeight: 'var(--font-medium)', fontSize: 'var(--text-sm)' }}>{p.nameUz}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{p.category?.nameUz}</div>
                      </td>
                      <td className="inv-table-stock">
                        <span style={{ fontWeight: 'var(--font-bold)', color: p.stock <= 5 ? 'var(--error)' : 'var(--text-primary)' }}>
                          {p.stock}
                        </span>
                      </td>
                      <td className="inv-hide-mobile inv-table-stock" style={{ color: 'var(--text-secondary)' }}>
                        {p.avgDailySales > 0 ? p.avgDailySales.toFixed(1) : '-'}
                      </td>
                      <td className="inv-table-stock">
                        <span style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-xs)', color: p.daysOfSupply <= 7 ? 'var(--error)' : p.daysOfSupply <= 14 ? 'var(--warning)' : 'var(--text-secondary)' }}>
                          {p.daysOfSupply >= 999 ? '∞' : `${p.daysOfSupply}k`}
                        </span>
                      </td>
                      <td className="inv-table-stock">
                        <span style={{ padding: '2px 6px', borderRadius: 'var(--radius-full)', background: st.bg, color: st.color, fontSize: '10px', fontWeight: 'var(--font-bold)' }}>
                          {stockLabel(p.status, lang)}
                        </span>
                      </td>
                      <td className="inv-hide-mobile inv-table-val" style={{ fontWeight: 'var(--font-semibold)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
                        {fmt(p.stockValue)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

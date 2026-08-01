'use client';

import { AdminStatsRevenue } from './AdminStatsRevenue';
import { AdminGrowSummary } from './AdminGrowSummary';

import { useState, useEffect } from 'react';
import {
  Banknote, RefreshCw, ShoppingCart, TrendingUp,
} from 'lucide-react';

export interface StatsData {
  // Online orders
  totalOrders: number;
  todayOrders: number;
  onlineRevenue: number;
  todayOnlineRevenue: number;
  totalDeliveryFees: number;
  todayDeliveryFees: number;
  // POS sales
  todayPOSSales: number;
  todayPOSRevenue: number;
  todayPOSReturns: number;
  todayReturnCount: number;
  // Combined (from analytics — already adjusted for returns)
  todayTotalRevenue: number;
  todayCost: number;
  todayProfit: number;
  todayMargin: number;
  todayReturns: number;
  // Products
  totalProducts: number;
  activeProducts: number;
  // Order statuses
  pendingOrders: number;
  deliveringOrders: number;
}

export function AdminStats() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [ordersRes, productCountsRes, posRes, revenueRes] = await Promise.all([
          fetch('/api/orders'),
          fetch('/api/products?count=true'),
          fetch('/api/inventory/pos'), // Today's POS sales
          fetch('/api/inventory/analytics?section=revenue'),
        ]);
        const ordersData = await ordersRes.json();
        const productCounts = await productCountsRes.json();
        const posData = await posRes.json();
        const revenueData = await revenueRes.json();

        const orders = ordersData.orders || [];
        const today = new Date().toISOString().slice(0, 10);

        const todayOrders = orders.filter((o: { createdAt: string }) => o.createdAt?.slice(0, 10) === today);
        const pending = orders.filter((o: { status: string }) => o.status === 'PENDING');
        const delivering = orders.filter((o: { status: string }) => o.status === 'DELIVERING');

        const todayOnlineRevenue = todayOrders.reduce((s: number, o: { subtotal: number }) => s + (o.subtotal || 0), 0);
        const todayDeliveryFees = todayOrders.reduce((s: number, o: { deliveryFee: number }) => s + (o.deliveryFee || 0), 0);
        const todayPOSRevenue = posData.summary?.totalRevenue || 0; // net (after returns)
        const todayPOSSales = posData.summary?.totalSales || 0;
        const todayPOSReturns = posData.summary?.totalReturnAmount || 0;
        const todayReturnCount = posData.summary?.totalReturns || 0;

        setStats({
          totalOrders: orders.length,
          todayOrders: todayOrders.length,
          onlineRevenue: orders.reduce((s: number, o: { subtotal: number }) => s + (o.subtotal || 0), 0),
          totalDeliveryFees: orders.reduce((s: number, o: { deliveryFee: number }) => s + (o.deliveryFee || 0), 0),
          todayDeliveryFees,
          todayOnlineRevenue: todayOnlineRevenue,
          todayPOSSales,
          todayPOSRevenue,
          todayPOSReturns,
          todayReturnCount,
          todayTotalRevenue: revenueData.todayRevenue || 0, // from analytics (already minus returns)
          todayCost: revenueData.todayCost || 0,
          todayProfit: revenueData.todayProfit || 0,
          todayMargin: revenueData.todayMargin || 0,
          todayReturns: revenueData.todayReturns || 0,
          totalProducts: productCounts.total || 0,
          activeProducts: productCounts.active || 0,
          pendingOrders: pending.length,
          deliveringOrders: delivering.length,
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

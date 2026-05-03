'use client';

import { useState, useEffect } from 'react';
import * as Icons from '@/components/ui/Icons';

interface StatsData {
  // Online orders
  totalOrders: number;
  todayOrders: number;
  onlineRevenue: number;
  todayOnlineRevenue: number;
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

        const todayOnlineRevenue = todayOrders.reduce((s: number, o: { total: number }) => s + (o.total || 0), 0);
        const todayPOSRevenue = posData.summary?.totalRevenue || 0; // net (after returns)
        const todayPOSSales = posData.summary?.totalSales || 0;
        const todayPOSReturns = posData.summary?.totalReturnAmount || 0;
        const todayReturnCount = posData.summary?.totalReturns || 0;

        setStats({
          totalOrders: orders.length,
          todayOrders: todayOrders.length,
          onlineRevenue: orders.reduce((s: number, o: { total: number }) => s + (o.total || 0), 0),
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
    { label: "Bugungi daromad", value: `${fmt(stats?.todayTotalRevenue || 0)}`, icon: <Icons.Banknote size={22} />, color: 'var(--success)' },
    { label: "Sof foyda", value: `${fmt(stats?.todayProfit || 0)}`, icon: <Icons.TrendingUp size={22} />, color: (stats?.todayProfit || 0) >= 0 ? '#10B981' : 'var(--error)' },
    { label: "POS sotish", value: `${stats?.todayPOSSales || 0} ta`, icon: <Icons.ShoppingCart size={22} />, color: 'var(--brand-primary)' },
    { label: "Qaytarish", value: stats?.todayReturnCount ? `-${fmt(stats.todayReturns)}` : '0', icon: <Icons.RefreshCw size={22} />, color: stats?.todayReturnCount ? '#EF4444' : 'var(--text-muted)' },
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
              background: `${stat.color}15`, color: stat.color,
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

      {/* Revenue breakdown */}
      <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>
        <h3 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-sm)' }}>
          <Icons.BarChart size={16} /> Bugungi taqsimot
        </h3>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'var(--brand-primary-light)', color: 'var(--brand-primary)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Icons.ShoppingCart size={12} /> POS: {fmt(stats?.todayPOSRevenue || 0)} so&apos;m
          </span>
          <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: '#3B82F615', color: '#3B82F6', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Icons.Truck size={12} /> Online: {fmt(stats?.todayOnlineRevenue || 0)} so&apos;m
          </span>
          {(stats?.todayReturnCount || 0) > 0 && (
            <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: '#EF444415', color: '#EF4444', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Icons.RefreshCw size={12} /> Qaytarish: -{fmt(stats?.todayPOSReturns || 0)} so&apos;m
            </span>
          )}
        </div>
      </div>

      {/* Order status */}
      <div className="card" style={{ padding: 'var(--space-4)' }}>
        <h3 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-sm)' }}>
          <Icons.ClipboardList size={16} /> Buyurtmalar holati
        </h3>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: '#F59E0B15', color: '#F59E0B', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Icons.Clock size={12} /> Kutilmoqda: {stats?.pendingOrders || 0}
          </span>
          <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: '#2D5BFF15', color: '#2D5BFF', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Icons.Truck size={12} /> Yetkazilmoqda: {stats?.deliveringOrders || 0}
          </span>
          <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: '#10B98115', color: '#10B981', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Icons.Banknote size={12} /> Jami online: {fmt(stats?.onlineRevenue || 0)} so&apos;m
          </span>
        </div>
      </div>
    </div>
  );
}

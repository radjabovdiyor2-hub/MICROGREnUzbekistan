'use client';

import { useState, useEffect } from 'react';
import {
  AlertTriangle, Banknote, BarChart, CheckCircle, ClipboardList, Clock, Leaf, Moon, RefreshCw, ShoppingCart, Sun, TrendingUp, Truck,
} from 'lucide-react';

interface StatsData {
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

      {/* Revenue breakdown */}
      <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>
        <h3 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-sm)' }}>
        <BarChart size={16} /> Распределение за сегодня
        </h3>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'var(--brand-primary-light)', color: 'var(--brand-primary)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ShoppingCart size={12} /> POS: {fmt(stats?.todayPOSRevenue || 0)} сум
          </span>
          <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'var(--info-bg)', color: 'var(--info)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Truck size={12} /> Онлайн (товары): {fmt(stats?.todayOnlineRevenue || 0)} сум
          </span>
          {(stats?.todayDeliveryFees || 0) > 0 && (
            <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: '#8B5CF615', color: '#8B5CF6', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Truck size={12} /> Доставка: {fmt(stats?.todayDeliveryFees || 0)} сум
            </span>
          )}
          {(stats?.todayReturnCount || 0) > 0 && (
            <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'var(--error-bg)', color: 'var(--error)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <RefreshCw size={12} /> Возвраты: -{fmt(stats?.todayPOSReturns || 0)} сум
            </span>
          )}
        </div>
      </div>

      {/* Order status */}
      <div className="card" style={{ padding: 'var(--space-4)' }}>
        <h3 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-sm)' }}>
          <ClipboardList size={16} /> Статус заказов
        </h3>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'var(--warning-bg)', color: 'var(--warning)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={12} /> Ожидание: {stats?.pendingOrders || 0}
          </span>
          <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: '#2D5BFF15', color: '#2D5BFF', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Truck size={12} /> Доставляется: {stats?.deliveringOrders || 0}
          </span>
          <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'var(--success-bg)', color: 'var(--success)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Banknote size={12} /> Всего онлайн: {fmt(stats?.onlineRevenue || 0)} сум
          </span>
        </div>
      </div>

      {/* Growing summary */}
      {(() => {
        try {
          const growData = JSON.parse(localStorage.getItem('mg_grow_batches') || '[]');
          const now = new Date().toISOString().slice(0, 10);
          let darkCount = 0, lightCount = 0, readyCount = 0, expiredCount = 0, expiredLoss = 0;
          for (const batch of growData) {
            if (batch.status === 'harvested') continue;
            const elapsed = Math.floor((new Date(now).getTime() - new Date(batch.seedDate).getTime()) / 86400000);
            const darkEnd = batch.darkDays;
            const lightEnd = darkEnd + batch.lightDays;
            const shelfEnd = lightEnd + batch.shelfDays;
            if (elapsed < darkEnd) darkCount++;
            else if (elapsed < lightEnd) lightCount++;
            else if (elapsed < shelfEnd) readyCount++;
            else { expiredCount++; expiredLoss += (batch.costPrice || 0) * (batch.harvestQty || batch.trays); }
          }
          const total = darkCount + lightCount + readyCount + expiredCount;
          if (total === 0) return null;
          return (
            <div className="card" style={{ padding: 'var(--space-4)' }}>
              <h3 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-sm)' }}>
                <Leaf size={16} /> Посадки ({total} активных)
              </h3>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {darkCount > 0 && <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: '#6366F115', color: '#6366F1', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Moon size={12} /> Темно: {darkCount}
                </span>}
                {lightCount > 0 && <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'var(--warning-bg)', color: 'var(--warning)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Sun size={12} /> На свету: {lightCount}
                </span>}
                {readyCount > 0 && <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'var(--success-bg)', color: 'var(--success)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle size={12} /> Готовы: {readyCount}
                </span>}
                {expiredCount > 0 && <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'var(--error-bg)', color: 'var(--error)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertTriangle size={12} /> Просрочено: {expiredCount} (убыток {fmt(expiredLoss)} сум)
                </span>}
              </div>
            </div>
          );
        } catch { return null; }
      })()}
    </div>
  );
}

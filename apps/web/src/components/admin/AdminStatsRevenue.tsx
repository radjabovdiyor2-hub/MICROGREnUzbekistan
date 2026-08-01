'use client';

import {
  Banknote, BarChart, ClipboardList, Clock, RefreshCw, ShoppingCart, Truck,
} from 'lucide-react';
import type { StatsData } from './AdminStats';

// Разбивка сегодняшней выручки и статусы заказов. Вынесено из AdminStats:
// блок читает только уже посчитанные суммы.

interface Props {
  stats: StatsData | null;
  fmt: (n: number) => string;
}

export function AdminStatsRevenue({ stats, fmt }: Props) {
  return (
    <>
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
      <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'color-mix(in srgb, var(--cat-2) 12%, transparent)', color: 'var(--cat-2)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
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
    <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'color-mix(in srgb, var(--cat-5) 12%, transparent)', color: 'var(--cat-5)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
      <Truck size={12} /> Доставляется: {stats?.deliveringOrders || 0}
    </span>
    <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'var(--success-bg)', color: 'var(--success)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
      <Banknote size={12} /> Всего онлайн: {fmt(stats?.onlineRevenue || 0)} сум
    </span>
  </div>
</div>
    </>
  );
}

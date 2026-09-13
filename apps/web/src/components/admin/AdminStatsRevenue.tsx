'use client';

import {
  Banknote, BarChart, ClipboardList, Clock, Percent, RefreshCw, ShoppingCart, Truck,
} from 'lucide-react';
import { sumLabel } from '@/lib/units';
import type { StatsData } from './statsTypes';

// Разбивка сегодняшней выручки и статусы заказов. Вынесено из AdminStats:
// блок читает только уже посчитанные суммы.

interface Props {
  stats: StatsData | null;
  fmt: (n: number) => string;
  lang: 'ru' | 'uz';
}

const T = {
  split: { ru: 'Распределение за сегодня', uz: 'Bugungi taqsimot' },
  online: { ru: 'Онлайн (товары)', uz: 'Onlayn (mahsulotlar)' },
  delivery: { ru: 'Доставка', uz: 'Yetkazib berish' },
  discounts: { ru: 'Скидки', uz: 'Chegirmalar' },
  returns: { ru: 'Возвраты', uz: 'Qaytarishlar' },
  total: { ru: 'Итого', uz: 'Jami' },
  sales: { ru: 'продаж', uz: 'sotuv' },
  average: { ru: 'средний чек', uz: "o'rtacha chek" },
  orderStatus: { ru: 'Статус заказов', uz: 'Buyurtmalar holati' },
  waiting: { ru: 'Ожидание', uz: 'Kutilmoqda' },
  delivering: { ru: 'Доставляется', uz: 'Yetkazilmoqda' },
  month: { ru: 'За 30 дней', uz: '30 kun uchun' },
  orders: { ru: 'заказов', uz: 'buyurtma' },
};

export function AdminStatsRevenue({ stats, fmt, lang }: Props) {
  const t = (k: keyof typeof T) => T[k][lang];
  const sum = sumLabel(lang);
  return (
    <>
{/* Revenue breakdown */}
<div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>
  <h3 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-sm)' }}>
  <BarChart size={16} /> {t('split')}
  </h3>
  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
    <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'var(--brand-primary-light)', color: 'var(--brand-primary)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
      <ShoppingCart size={12} /> POS: {fmt(stats?.todayGoodsPos || 0)} {sum}
    </span>
    <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'var(--info-bg)', color: 'var(--info)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
      <Truck size={12} /> {t('online')}: {fmt(stats?.todayGoodsOnline || 0)} {sum}
    </span>
    {(stats?.todayDeliveryFees || 0) > 0 && (
      <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'color-mix(in srgb, var(--cat-2) 12%, transparent)', color: 'var(--cat-2)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <Truck size={12} /> {t('delivery')}: {fmt(stats?.todayDeliveryFees || 0)} {sum}
      </span>
    )}
    {(stats?.todayDiscount || 0) > 0 && (
      <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'var(--warning-bg)', color: 'var(--warning)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <Percent size={12} /> {t('discounts')}: -{fmt(stats?.todayDiscount || 0)} {sum}
      </span>
    )}
    {(stats?.todayReturnCount || 0) > 0 && (
      <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'var(--error-bg)', color: 'var(--error)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <RefreshCw size={12} /> {t('returns')}: -{fmt(stats?.todayReturns || 0)} {sum}
      </span>
    )}
  </div>
  <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
    {t('total')}: {fmt(stats?.todayTotalRevenue || 0)} {sum}
    {(stats?.todayOrders || 0) + (stats?.todayPOSSales || 0) > 0 && (
      <> · {(stats?.todayOrders || 0) + (stats?.todayPOSSales || 0)} {t('sales')} · {t('average')} {fmt(stats?.todayAverageCheck || 0)} {sum}</>
    )}
  </div>
</div>

{/* Order status */}
<div className="card" style={{ padding: 'var(--space-4)' }}>
  <h3 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-sm)' }}>
    <ClipboardList size={16} /> {t('orderStatus')}
  </h3>
  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
    <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'var(--warning-bg)', color: 'var(--warning)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
      <Clock size={12} /> {t('waiting')}: {stats?.pendingOrders || 0}
    </span>
    <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'color-mix(in srgb, var(--cat-5) 12%, transparent)', color: 'var(--cat-5)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
      <Truck size={12} /> {t('delivering')}: {stats?.deliveringOrders || 0}
    </span>
    {/* За 30 дней, а не «всего»: прежнее «всего» считалось по 20 последним
        заказам, которые успевали закончиться за один активный день. */}
    <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'var(--success-bg)', color: 'var(--success)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
      <Banknote size={12} /> {t('month')}: {fmt(stats?.monthRevenue || 0)} {sum} ({stats?.monthOrders || 0} {t('orders')})
    </span>
  </div>
</div>
    </>
  );
}

'use client';

import { TrendingDown, TrendingUp } from 'lucide-react';

import { districtLabel } from '@/lib/customers/districts';
import { SEGMENT_META, type SegmentTrend } from '@/lib/customers/segments';

import { formatSum, type PointView } from './mapFeature';

// ══════════════════════════════════════════════════════════════════════
// Шапка панели клиента: состояние, переход за месяц, три цифры.
//
// Переход показан выше цифр намеренно. «Активный → Под угрозой» дороже
// любой суммы: он значит, что отношения рушатся прямо сейчас и их ещё
// можно спасти, тогда как «Потерян → Потерян» — что всё случилось давно.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  point: PointView;
  trend: SegmentTrend | null;
  lang: 'ru' | 'uz';
}

const label = {
  orders: { ru: 'Заказов', uz: 'Buyurtmalar' },
  spent: { ru: 'Потрачено', uz: 'Sarflangan' },
  district: { ru: 'Район', uz: 'Tuman' },
  perMonth: { ru: 'за месяц', uz: 'bir oyda' },
};

export function CustomerMapPanelStats({ point, trend, lang }: Props) {
  const changed = trend && (trend.worsened || trend.improved);

  return (
    <>
      {changed && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--font-semibold)',
            color: trend.worsened ? 'var(--error)' : 'var(--success)',
          }}
        >
          {trend.worsened ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
          <span>
            {SEGMENT_META[trend.before][lang]} → {SEGMENT_META[trend.after][lang]}
          </span>
          <span style={{ color: 'var(--text-muted)', fontWeight: 'var(--font-normal)' }}>
            {label.perMonth[lang]}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
        <Stat title={label.orders[lang]} value={String(point.ordersCount)} />
        <Stat title={label.spent[lang]} value={`${formatSum(point.totalSpent)} сум`} />
        <Stat title={label.district[lang]} value={districtLabel(point.district, lang)} />
      </div>
    </>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{title}</div>
      <div style={{ fontWeight: 'var(--font-semibold)' }}>{value}</div>
    </div>
  );
}

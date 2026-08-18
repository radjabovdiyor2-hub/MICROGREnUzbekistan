'use client';

import { SEGMENT_META } from '@/lib/customers/segments';

import { formatSum, type UnplacedCustomer } from './mapFeature';

// ══════════════════════════════════════════════════════════════════════
// Строка очереди на расстановку: кто, где и на сколько.
//
// Адрес показываем даже когда он пустой — тогда прямо и пишем, что его
// нет. Это не украшение: по адресу владелец понимает, куда ставить пин,
// а его отсутствие объясняет, почему геокодер этого клиента не осилит.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  customer: UnplacedCustomer;
  lang: 'ru' | 'uz';
  placing: boolean;
  onPlace: () => void;
  onCancel: () => void;
  labels: { place: string; cancel: string; noAddress: string };
}

const ellipsis: React.CSSProperties = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

export function UnplacedRow({ customer, placing, onPlace, onCancel, labels }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-3)',
        borderBottom: '1px solid var(--border)',
        background: placing ? 'var(--warning-bg)' : 'transparent',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: SEGMENT_META[customer.state].token,
          flexShrink: 0,
        }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-sm)', ...ellipsis }}>{customer.name}</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', ...ellipsis }}>
          {customer.address || labels.noAddress} · {formatSum(customer.totalSpent)} сум
        </div>
      </div>

      {placing ? (
        <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>
          {labels.cancel}
        </button>
      ) : (
        <button type="button" className="btn btn-sm btn-ghost" onClick={onPlace}>
          {labels.place}
        </button>
      )}
    </div>
  );
}

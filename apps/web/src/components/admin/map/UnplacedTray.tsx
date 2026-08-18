'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, MapPin } from 'lucide-react';

import { SEGMENT_META } from '@/lib/customers/segments';

import { formatSum, type UnplacedCustomer } from './mapFeature';
import { GeocodeControls } from './GeocodeControls';

// ══════════════════════════════════════════════════════════════════════
// Клиенты, которых не удалось поставить на карту.
//
// Это не список ошибок, а рабочая очередь. Пока геокодера нет, ручная
// расстановка — основной способ наполнить карту: тридцать ключевых
// ресторанов ставятся за четверть часа и уже дают живую картину.
//
// Клиенты отсортированы по деньгам: если размечать успеют не всех,
// размечены будут те, чья пропажа заметнее.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  items: UnplacedCustomer[];
  lang: 'ru' | 'uz';
  placingId: number | null;
  onPlace: (id: number) => void;
  onCancelPlacing: () => void;
  /** Перезапросить карту после каждого батча геокодера. */
  onRefresh: () => void;
}

const label = {
  title: { ru: 'Без координат', uz: 'Koordinatasiz' },
  place: { ru: 'Поставить пин', uz: 'Pin qoʻyish' },
  placing: { ru: 'Кликните на карте', uz: 'Xaritada bosing' },
  cancel: { ru: 'Отмена', uz: 'Bekor qilish' },
  noAddress: { ru: 'адрес не указан', uz: 'manzil koʻrsatilmagan' },
  empty: { ru: 'Все клиенты на карте', uz: 'Barcha mijozlar xaritada' },
};

export function UnplacedTray({
  items,
  lang,
  placingId,
  onPlace,
  onCancelPlacing,
  onRefresh,
}: Props) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) {
    return (
      <div
        className="card"
        style={{ padding: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}
      >
        {label.empty[lang]}
      </div>
    );
  }

  const sorted = [...items].sort((a, b) => b.totalSpent - a.totalSpent);

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-3)',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          color: 'var(--text-primary)',
        }}
      >
        <MapPin size={16} style={{ color: 'var(--warning)' }} />
        <span style={{ flex: 1, textAlign: 'left', fontWeight: 'var(--font-semibold)' }}>
          {label.title[lang]}: {items.length}
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      <GeocodeControls lang={lang} onBatchDone={onRefresh} />

      {open && (
        <div style={{ maxHeight: 260, overflowY: 'auto', borderTop: '1px solid var(--border)' }}>
          {sorted.map((c) => {
            const isPlacing = placingId === c.id;
            return (
              <div
                key={c.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-2) var(--space-3)',
                  borderBottom: '1px solid var(--border)',
                  background: isPlacing ? 'var(--warning-bg)' : 'transparent',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: SEGMENT_META[c.state].token,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 'var(--text-sm)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {c.name}
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {c.address || label.noAddress[lang]} · {formatSum(c.totalSpent)} сум
                  </div>
                </div>
                {isPlacing ? (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={onCancelPlacing}>
                    {label.cancel[lang]}
                  </button>
                ) : (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => onPlace(c.id)}>
                    {label.place[lang]}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {placingId !== null && (
        <div
          style={{
            padding: 'var(--space-2) var(--space-3)',
            background: 'var(--warning-bg)',
            color: 'var(--warning)',
            fontSize: 'var(--text-sm)',
          }}
        >
          {label.placing[lang]} · Esc — {label.cancel[lang].toLowerCase()}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, MapPin, Wand2 } from 'lucide-react';

import { SEGMENT_META } from '@/lib/customers/segments';

import { formatSum, type UnplacedCustomer } from './mapFeature';
import { useGeocodePass } from './useGeocodePass';

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
  geocode: { ru: 'Найти по адресам', uz: 'Manzil boʻyicha topish' },
  stop: { ru: 'Стоп', uz: 'Toʻxtatish' },
  coarse: { ru: 'только город — пин не ставим', uz: 'faqat shahar — pin qoʻyilmadi' },
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
  const geo = useGeocodePass(onRefresh);

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

      {/* Автоматика и ручной пин стоят рядом намеренно: геокодер закрывает
          массу, но точность «город» он честно пропускает, и остаток
          доразмечается руками. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: '0 var(--space-3) var(--space-3)',
          flexWrap: 'wrap',
        }}
      >
        {geo.running ? (
          <button type="button" className="btn btn-sm btn-ghost" onClick={geo.stop}>
            {label.stop[lang]}
          </button>
        ) : (
          <button type="button" className="btn btn-sm btn-primary" onClick={() => geo.start()}>
            <Wand2 size={14} /> {label.geocode[lang]}
          </button>
        )}

        {(geo.running || geo.finished) && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {geo.progress.processed} → {geo.progress.placed} ✓
            {geo.progress.tooCoarse > 0 && `, ${geo.progress.tooCoarse} ${label.coarse[lang]}`}
            {geo.progress.noAddress > 0 &&
              `, ${geo.progress.noAddress} ${label.noAddress[lang]}`}
          </span>
        )}
      </div>

      {geo.error && (
        <div
          style={{
            padding: 'var(--space-2) var(--space-3)',
            background: 'var(--error-bg)',
            color: 'var(--error)',
            fontSize: 'var(--text-sm)',
          }}
        >
          {geo.error}
        </div>
      )}

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

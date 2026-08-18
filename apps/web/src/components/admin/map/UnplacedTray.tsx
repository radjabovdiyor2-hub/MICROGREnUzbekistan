'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, ListChecks, MapPin } from 'lucide-react';

import { type UnplacedCustomer } from './mapFeature';
import { GeocodeControls } from './GeocodeControls';
import { UnplacedRow } from './UnplacedRow';

// ══════════════════════════════════════════════════════════════════════
// Клиенты, которых не удалось поставить на карту.
//
// Это не список ошибок, а рабочая очередь. Пока геокодера нет, ручная
// расстановка — основной способ наполнить карту: тридцать ключевых
// ресторанов ставятся за четверть часа и уже дают живую картину.
//
// Клиенты приходят отсортированными по деньгам — порядок задаёт хук, и
// второй сортировки здесь быть не должно: «следующий» в режиме подряд
// обязан совпадать с тем, что владелец видит списком.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  items: UnplacedCustomer[];
  lang: 'ru' | 'uz';
  placingId: number | null;
  onPlace: (id: number) => void;
  onCancelPlacing: () => void;
  /** Перезапросить карту после каждого батча геокодера. */
  onRefresh: () => void;
  /** Режим «подряд»: следующий клиент взводится сам после каждого пина. */
  chaining: boolean;
  onStartChain: () => void;
  onStopChain: () => void;
}

const label = {
  title: { ru: 'Без координат', uz: 'Koordinatasiz' },
  place: { ru: 'Поставить пин', uz: 'Pin qoʻyish' },
  placing: { ru: 'Кликните на карте', uz: 'Xaritada bosing' },
  cancel: { ru: 'Отмена', uz: 'Bekor qilish' },
  noAddress: { ru: 'адрес не указан', uz: 'manzil koʻrsatilmagan' },
  empty: { ru: 'Все клиенты на карте', uz: 'Barcha mijozlar xaritada' },
  chain: { ru: 'Расставить подряд', uz: 'Ketma-ket joylash' },
  stopChain: { ru: 'Закончить', uz: 'Tugatish' },
  next: { ru: 'Сейчас ставим', uz: 'Hozir qoʻyamiz' },
  left: { ru: 'осталось', uz: 'qoldi' },
};

export function UnplacedTray({
  items,
  lang,
  placingId,
  onPlace,
  onCancelPlacing,
  onRefresh,
  chaining,
  onStartChain,
  onStopChain,
}: Props) {
  const [open, setOpen] = useState(false);
  const current = items.find((c) => c.id === placingId) ?? null;

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

      {/* Расстановка подряд: тридцать с лишним точек по одной — это тридцать
          заходов в список. В режиме подряд владелец только кликает по карте,
          а очередь сама подаёт следующего, начиная с самого денежного. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: '0 var(--space-3) var(--space-3)',
        }}
      >
        {chaining ? (
          <button type="button" className="btn btn-sm btn-ghost" onClick={onStopChain}>
            {label.stopChain[lang]}
          </button>
        ) : (
          <button type="button" className="btn btn-sm btn-ghost" onClick={onStartChain}>
            <ListChecks size={14} /> {label.chain[lang]}
          </button>
        )}
      </div>

      {open && (
        <div style={{ maxHeight: 260, overflowY: 'auto', borderTop: '1px solid var(--border)' }}>
          {items.map((c) => (
            <UnplacedRow
              key={c.id}
              customer={c}
              lang={lang}
              placing={placingId === c.id}
              onPlace={() => onPlace(c.id)}
              onCancel={onCancelPlacing}
              labels={{
                place: label.place[lang],
                cancel: label.cancel[lang],
                noAddress: label.noAddress[lang],
              }}
            />
          ))}
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
          {current ? (
            <>
              <strong>{label.next[lang]}: {current.name}</strong>
              {' — '}
              {label.placing[lang].toLowerCase()}
              {chaining && `, ${label.left[lang]} ${items.length}`}
            </>
          ) : (
            label.placing[lang]
          )}
          {' · Esc — '}
          {label.cancel[lang].toLowerCase()}
        </div>
      )}
    </div>
  );
}

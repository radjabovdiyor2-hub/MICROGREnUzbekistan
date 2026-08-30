'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ReactNode } from 'react';

import { useRememberedFlag } from './useMapPrefs';

// ══════════════════════════════════════════════════════════════════════
// Сворачиваемая панель боковой колонки карты.
//
// ЗАЧЕМ. Легенда, объезд, разрез по районам, покрытие и лоток «без пина»
// стояли развёрнутыми ВСЕ И ВСЕГДА. На ноутбуке это метр прокрутки справа
// от карты, на телефоне — та же простыня под ней: чтобы вернуться к карте
// после взгляда на легенду, приходилось листать мимо четырёх панелей,
// которые в этот момент не спрашивали ни о чём.
//
// СОСТОЯНИЕ ЗАПОМИНАЕТСЯ. Тот же приём, что у фильтров: свернул — значит
// свернул, а не «до перезагрузки». Иначе выбор пришлось бы повторять
// каждое утро, то есть не делать вовсе.
//
// РАЗВЁРНУТА ПО УМОЛЧАНИЮ. Свёрнутая панель, о которой человек не знает,
// — это спрятанный инструмент; решение «убрать с глаз» должно быть его, а
// не наше.
// ══════════════════════════════════════════════════════════════════════

export function MapFoldable({
  title,
  storageKey,
  children,
  defaultOpen = true,
  /** Короткая правая подпись: число в скобках, сумма — то, что видно свёрнутым. */
  hint,
}: {
  title: string;
  /** Ключ в localStorage — свой у каждой панели. */
  storageKey: string;
  children: ReactNode;
  defaultOpen?: boolean;
  hint?: string;
}) {
  const [open, setOpen] = useRememberedFlag(storageKey, defaultOpen);

  // Своей карточки у обёртки НЕТ: панели внутри рисуют её сами, и вторая
  // рамка вокруг первой давала бы двойную обводку и двойной отступ.
  return (
    <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-1) var(--space-2)',
          minHeight: 40,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          color: 'var(--text-secondary)',
        }}
      >
        <span style={{
          flex: 1,
          textAlign: 'left',
          fontWeight: 'var(--font-semibold)',
          fontSize: 'var(--text-xs)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>
          {title}
        </span>
        {hint && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{hint}</span>
        )}
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {/* Свёрнутая панель размонтируется — и это безопасно ровно потому,
          что своего состояния у них нет: объезд живёт в useDayRoute,
          фильтры и выбор — в useCustomerMap, оба выше по дереву. Держи
          панель своё состояние внутри, сворачивание стирало бы работу. */}
      {open && <div style={{ display: 'grid', gap: 'var(--space-3)' }}>{children}</div>}
    </div>
  );
}

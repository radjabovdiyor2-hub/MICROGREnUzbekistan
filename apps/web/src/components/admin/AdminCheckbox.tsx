'use client';

import type { CSSProperties } from 'react';

// ══════════════════════════════════════════════════════════════════════
// Флажок выбора, в который можно попасть пальцем.
//
// Стоял голый `<input type="checkbox">` 16×16. По рекомендации Apple и
// WCAG 2.5.8 цель нажатия — 44 пикселя; шестнадцать это меньше трети. На
// телефоне выбрать запись было буквально нельзя, и владелец так и сказал:
// «выбрать несколько невозможно».
//
// Увеличивать сам флажок до 44 нельзя — он станет уродливым квадратом на
// половину строки. Поэтому растёт ОБЛАСТЬ НАЖАТИЯ: обёртка 44×44 с
// флажком 18×18 по центру. Глазами прежний размер, пальцем — норма.
//
// Метка обязательна: список из тридцати одинаковых квадратов без подписи
// нечитаем для экранного диктора — «флажок, флажок, флажок».
// ══════════════════════════════════════════════════════════════════════

export function AdminCheckbox({ checked, onChange, label, indeterminate = false, style }: {
  checked: boolean;
  onChange: () => void;
  /** Что именно выбирают: «Выбрать задачу №95». */
  label: string;
  /** Выбрано частично — галка в шапке при неполном выборе. */
  indeterminate?: boolean;
  style?: CSSProperties;
}) {
  return (
    <label
      // Клик по обёртке не должен всплывать: строки списков кликабельны
      // целиком (открыть карточку), и выбор открывал бы её заодно.
      onClick={(e) => e.stopPropagation()}
      style={{
        width: 44,
        height: 44,
        margin: -13,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        flexShrink: 0,
        ...style,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={label}
        ref={(el) => {
          // `indeterminate` задаётся только из JS — атрибута для него нет.
          if (el) el.indeterminate = indeterminate && !checked;
        }}
        style={{ width: 18, height: 18, accentColor: 'var(--brand-primary)', cursor: 'pointer' }}
      />
    </label>
  );
}

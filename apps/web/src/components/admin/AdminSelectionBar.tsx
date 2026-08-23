'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// «Выбрано: 12» — панель действий над выбранными записями.
//
// Одна на все экраны: в задачах такая панель была своя, и стоило добавить
// вторую на заказах, как они разошлись бы — где-то «снять выбор» слева,
// где-то справа, где-то его нет вовсе.
//
// ПОЧЕМУ ПРИЛИПАЕТ СНИЗУ НА ТЕЛЕФОНЕ
//
// Панель стояла НАД списком. Выбрал двенадцать записей, пролистал вниз,
// чтобы дочитать последнюю, — и кнопка действия уехала за верхний край.
// Надо листать обратно вверх, держа выбор в голове. На широком экране это
// незаметно, на телефоне это и есть работа.
//
// Снизу — потому что там большой палец. Отступ снизу учитывает системную
// полосу iPhone (`safe-area-inset-bottom`), иначе кнопка ложится под неё.
// ══════════════════════════════════════════════════════════════════════

export function AdminSelectionBar({ count, onClear, children, lang = 'ru' }: {
  count: number;
  onClear: () => void;
  /** Кнопки действий — их набор у каждого экрана свой. */
  children: ReactNode;
  lang?: 'ru' | 'uz';
}) {
  if (count === 0) return null;

  return (
    <div
      className="card admin-selection-bar"
      style={{
        padding: '10px 14px',
        borderRadius: 12,
        display: 'flex',
        gap: 'var(--space-2)',
        alignItems: 'center',
        flexWrap: 'wrap',
        fontSize: 'var(--text-sm)',
        // Над содержимым, но под модалками: подтверждение удаления должно
        // накрывать панель, а не наоборот.
        zIndex: 20,
      }}
    >
      <strong style={{ whiteSpace: 'nowrap' }}>
        {lang === 'ru' ? `Выбрано: ${count}` : `Tanlandi: ${count}`}
      </strong>

      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={onClear}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
      >
        <X size={14} /> {lang === 'ru' ? 'Снять' : 'Bekor'}
      </button>

      {/* Действия прижаты вправо: слева — сколько выбрано, справа — что с
          этим сделать. Один порядок на всех экранах. */}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {children}
      </div>
    </div>
  );
}

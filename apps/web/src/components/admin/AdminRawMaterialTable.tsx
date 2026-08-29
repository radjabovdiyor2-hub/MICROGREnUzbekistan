'use client';

import { PackagePlus, RotateCcw, Trash2 } from 'lucide-react';
import { KIND_LABELS, type RawMaterial } from './rawMaterialTypes';
import { focusOutline, isFocused, useScrollToFocused } from './useFocusedRow';

// Таблица остатков сырья. Вынесена из AdminRawMaterials, чтобы каждый файл
// оставался в пределах 200 строк.

interface Props {
  materials: RawMaterial[];
  fmt: (n: number) => string;
  onReceipt: (material: RawMaterial) => void;
  onDelete: (material: RawMaterial) => void;
  onRestore: (material: RawMaterial) => void;
  /** Сырьё, ради которого пришли по ссылке (`?focus=`, `receive_material`). */
  focus?: string;
}

const cell: React.CSSProperties = {
  padding: 'var(--space-2) var(--space-3)',
  fontSize: 'var(--text-sm)',
  whiteSpace: 'nowrap',
};

export function AdminRawMaterialTable({
  materials, fmt, onReceipt, onDelete, onRestore, focus = '',
}: Props) {
  const scrollToFocused = useScrollToFocused<HTMLTableRowElement>();
  if (materials.length === 0) {
    return (
      <div className="card" style={{ padding: 'var(--space-4)', color: 'var(--text-muted)' }}>
        Сырья пока нет. Заведите семена, субстрат и упаковку — тогда приход
        начнёт считать их средневзвешенную себестоимость.
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          {/* --border, а не --border-primary: второй переменной нет ни в
              токенах, ни в globals.css, и рамка брала цвет текста. */}
          <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
            <th style={{ ...cell, color: 'var(--text-muted)' }}>НАЗВАНИЕ</th>
            <th style={{ ...cell, color: 'var(--text-muted)' }}>ТИП</th>
            <th style={{ ...cell, color: 'var(--text-muted)' }}>ОСТАТОК</th>
            <th style={{ ...cell, color: 'var(--text-muted)' }}>СЕБЕСТОИМОСТЬ</th>
            <th style={{ ...cell, color: 'var(--text-muted)' }}>В ЗАПАСЕ</th>
            <th style={{ ...cell, color: 'var(--text-muted)' }}>ПОСЛЕДНЯЯ ЦЕНА</th>
            <th style={cell} />
          </tr>
        </thead>
        <tbody>
          {materials.map((m) => (
            <tr key={m.id}
              ref={isFocused(focus, m.id) ? scrollToFocused : undefined}
              style={{
                borderBottom: '1px solid var(--border-secondary)',
                opacity: m.isActive === false ? 0.5 : 1,
                ...focusOutline(isFocused(focus, m.id)),
              }}>
              <td style={{ ...cell, fontWeight: 'var(--font-semibold)' }}>
                {m.name}
                {m.cropType && (
                  <span style={{ color: 'var(--text-muted)', fontWeight: 'var(--font-normal)' }}>
                    {' '}· {m.cropType}
                  </span>
                )}
              </td>
              <td style={{ ...cell, color: 'var(--text-secondary)' }}>{KIND_LABELS[m.kind]}</td>
              <td style={{ ...cell, color: m.isLow ? 'var(--warning)' : undefined, fontWeight: m.isLow ? 'var(--font-semibold)' : undefined }}>
                {m.stock} {m.unit}
                {m.isLow && ' ⚠️'}
              </td>
              {/* Средневзвешенная: закупки усредняются с остатком, поэтому
                  цена не скачет вместе с рынком при каждой поставке. */}
              <td style={cell}>{fmt(m.avgCost)} сум / {m.unit}</td>
              <td style={cell}>{fmt(m.stockValue)} сум</td>
              <td style={{ ...cell, color: 'var(--text-secondary)' }}>
                {m.lastPrice
                  ? `${fmt(m.lastPrice.price)} — ${m.lastPrice.supplier}`
                  : '—'}
              </td>
              <td style={cell}>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  {m.isActive === false ? (
                    <button className="btn btn-sm btn-ghost" onClick={() => onRestore(m)}>
                      <RotateCcw size={14} /> Вернуть
                    </button>
                  ) : (
                    <>
                      <button className="btn btn-sm" onClick={() => onReceipt(m)}>
                        <PackagePlus size={14} /> Приход
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => onDelete(m)}
                        style={{ color: 'var(--error)' }} aria-label="Скрыть">
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

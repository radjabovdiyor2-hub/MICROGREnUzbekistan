'use client';

import { PackagePlus } from 'lucide-react';
import { KIND_LABELS, type RawMaterial } from './rawMaterialTypes';

// Таблица остатков сырья. Вынесена из AdminRawMaterials, чтобы каждый файл
// оставался в пределах 200 строк.

interface Props {
  materials: RawMaterial[];
  fmt: (n: number) => string;
  onReceipt: (material: RawMaterial) => void;
}

const cell: React.CSSProperties = {
  padding: 'var(--space-2) var(--space-3)',
  fontSize: 'var(--text-sm)',
  whiteSpace: 'nowrap',
};

export function AdminRawMaterialTable({ materials, fmt, onReceipt }: Props) {
  if (materials.length === 0) {
    return (
      <div className="card" style={{ padding: 'var(--space-4)', color: 'var(--text-muted)' }}>
        Сырья пока нет. Заведите семена, субстрат и упаковку — тогда посадка
        начнёт списывать их по норме и считать себестоимость партии.
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-primary)', textAlign: 'left' }}>
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
            <tr key={m.id} style={{ borderBottom: '1px solid var(--border-secondary)' }}>
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
                <button className="btn btn-sm" onClick={() => onReceipt(m)}>
                  <PackagePlus size={14} /> Приход
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

'use client';

import React from 'react';

import { formatSum } from '@/lib/units';
import type { MarginRow } from '@/lib/finance/margin';


interface Props {
  title: string;
  rows: MarginRow[];
  emptyHint: string;
  lang: 'ru' | 'uz';
}

/**
 * Разрез маржинальности одной таблицей.
 *
 * Строки приходят уже отсортированными от худшего — сортировать здесь заново
 * нельзя: смысл разреза в том, чтобы убыточное было видно сразу.
 */
export function AdminMarginTable({ title, rows, emptyHint, lang }: Props) {
  return (
    <div className="card" style={{ padding: 'var(--space-4)', borderRadius: 14 }}>
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginBottom: 'var(--space-3)' }}>
        {title}
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{emptyHint}</div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {rows.map((row) => {
            const loss = row.margin < 0;
            return (
              <div
                key={row.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto',
                  gap: 'var(--space-3)',
                  alignItems: 'center',
                  fontSize: 'var(--text-xs)',
                }}
              >
                <span style={{ color: loss ? 'var(--error)' : 'var(--text-primary)', fontWeight: loss ? 600 : 400 }}>
                  {row.label}
                </span>
                <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {formatSum(row.revenue, lang)}
                </span>
                <span
                  style={{
                    color: loss ? 'var(--error)' : 'var(--success)',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    minWidth: 92,
                    textAlign: 'right',
                  }}
                >
                  {formatSum(row.margin, lang)}
                  {row.marginRate !== null && ` · ${Math.round(row.marginRate * 100)}%`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

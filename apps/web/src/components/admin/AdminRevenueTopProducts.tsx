'use client';

import React from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';

interface TopProd { name: string; revenue: number; cost: number; profit: number; margin: number; sold: number }

interface Props {
  topProfitable: TopProd[];
  topLoss: TopProd[];
  fmt: (n: number) => string;
}

export function AdminRevenueTopProducts({ topProfitable, topLoss, fmt }: Props) {
  return (
    <div className="rev-grid-2">
      <div className="card" style={{ padding: 'var(--space-4)' }}>
        <h4 style={{ fontWeight: 700, marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--success)' }}>
          <TrendingUp size={14} /> Самые прибыльные товары
        </h4>
        {(!topProfitable || topProfitable.length === 0) ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', textAlign: 'center', padding: 'var(--space-4)' }}>
            Требуются продажи с указанной себестоимостью
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            {topProfitable.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ width: 20, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 700, textAlign: 'right' }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{p.sold} шт · {p.margin.toFixed(0)}% маржа</div>
                </div>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: 'var(--success)', minWidth: 55, textAlign: 'right' }}>+{fmt(p.profit)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 'var(--space-4)' }}>
        <h4 style={{ fontWeight: 700, marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--error)' }}>
          <TrendingDown size={14} /> Наименее прибыльные
        </h4>
        {(!topLoss || topLoss.length === 0) ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', textAlign: 'center', padding: 'var(--space-4)' }}>
             Нет данных
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            {topLoss.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ width: 20, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 700, textAlign: 'right' }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{p.sold} шт · {p.margin.toFixed(0)}% маржа</div>
                </div>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: p.profit < 0 ? 'var(--error)' : 'var(--warning)', minWidth: 55, textAlign: 'right' }}>{fmt(p.profit)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { Clock, Download, ShoppingCart } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Sale } from './movementTypes';

// Вкладка «История продаж» кассы. Вынесено из AdminMovements: файл перерос
// 200 строк, а две его вкладки друг о друге ничего не знают.

export function AdminSalesTab({
  sales, salesDate, setSalesDate, salesLoading, salesSummary, fmt, inputStyle, onExport,
}: {
  sales: Sale[];
  salesDate: string;
  setSalesDate: (v: string) => void;
  salesLoading: boolean;
  salesSummary: { totalSales: number; totalItems: number; totalRevenue: number };
  fmt: (n: number) => string;
  inputStyle: CSSProperties;
  onExport: (type: string) => void;
}) {
  return (
  <>
    {/* Date picker + summary */}
    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-3)', flexWrap: 'wrap' }}>
      <input type="date" value={salesDate} onChange={e => setSalesDate(e.target.value)}
        style={{ ...inputStyle, width: 'auto' }} />
      <button onClick={() => setSalesDate(new Date().toISOString().slice(0, 10))} className="btn btn-ghost btn-sm" style={{ fontSize: 'var(--text-xs)' }}>
        Bugun
      </button>
      <button onClick={() => {
        const d = new Date(salesDate);
        d.setDate(d.getDate() - 1);
        setSalesDate(d.toISOString().slice(0, 10));
      }} className="btn btn-ghost btn-sm" style={{ fontSize: 'var(--text-xs)' }}>
        ← Kecha
      </button>
      <div style={{ flex: 1 }} />
      <button onClick={() => onExport('sales')} className="btn btn-outline btn-sm"
        style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--text-xs)' }}>
        <Download size={12} /> 30 kun CSV
      </button>
    </div>

    {/* Summary cards */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
      <div className="card" style={{ padding: 'var(--space-3)', textAlign: 'center' }}>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Sotishlar</div>
        <div style={{ fontWeight: 800, fontSize: 'var(--text-lg)', color: 'var(--brand-primary)' }}>{salesSummary.totalSales}</div>
      </div>
      <div className="card" style={{ padding: 'var(--space-3)', textAlign: 'center' }}>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Tovarlar</div>
        <div style={{ fontWeight: 800, fontSize: 'var(--text-lg)' }}>{salesSummary.totalItems}</div>
      </div>
      <div className="card" style={{ padding: 'var(--space-3)', textAlign: 'center' }}>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Tushum</div>
        <div style={{ fontWeight: 800, fontSize: 'var(--text-sm)', color: 'var(--success)' }}>{fmt(salesSummary.totalRevenue)}</div>
      </div>
    </div>

    {/* Sales list */}
    {salesLoading ? (
      <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
        <Clock size={32} style={{ animation: 'pulse 1.5s infinite' }} />
      </div>
    ) : sales.length === 0 ? (
      <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
        <ShoppingCart size={48} style={{ opacity: 0.3, marginBottom: 'var(--space-2)' }} />
        <p>Bu kunda sotishlar yo&apos;q</p>
      </div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {sales.map((sale, idx) => (
          <div key={sale.number} className="card" style={{ padding: 'var(--space-3)' }}>
            {/* Sale header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span style={{ width: 28, height: 28, borderRadius: 'var(--radius-md)', background: 'var(--success-bg)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '11px' }}>
                  {idx + 1}
                </span>
                <div>
                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, fontFamily: 'monospace' }}>{sale.number}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {new Date(sale.time).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })} · {sale.itemCount} ta tovar
                  </div>
                </div>
              </div>
              <div style={{ fontWeight: 800, color: 'var(--success)', fontSize: 'var(--text-sm)' }}>
                {fmt(sale.total)} so&apos;m
              </div>
            </div>
            {/* Sale items */}
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-2)' }}>
              {sale.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', padding: '2px 0', color: 'var(--text-secondary)' }}>
                  <span>{Math.abs(item.quantity)}× {item.product.nameUz}</span>
                  <span style={{ fontWeight: 600 }}>{fmt(Math.abs(item.quantity) * item.product.price)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    )}
  </>
  );
}

'use client';

import { Clock, Download, RotateCcw, ShoppingCart } from 'lucide-react';
import type { CSSProperties } from 'react';

import { AdminSaleRow } from './AdminSaleRow';
import type { Sale } from './movementTypes';

// ══════════════════════════════════════════════════════════════════════
// Вкладка «История продаж» кассы.
//
// ВОЗВРАТЫ ТЕПЕРЬ ВИДНЫ. Сервер считал их с самого начала и вычитал из
// «Tushum», но на экран не выводил ни одной строкой: сумма чеков не сходилась
// с выручкой дня, и объяснения этому в интерфейсе не было. Отдельным списком,
// а не вперемешку с продажами: возврат — это отмена, и смешивать его со
// продажами в одной ленте значит прятать его в ней.
//
// Кто продал и кому — в самой карточке чека (AdminSaleRow).
// ══════════════════════════════════════════════════════════════════════

const text = {
  returns: { ru: 'Возвраты', uz: 'Qaytarishlar' },
  empty: { ru: 'В этот день продаж нет', uz: "Bu kunda sotishlar yo'q" },
};

export function AdminSalesTab({
  sales, returns, salesDate, setSalesDate, salesLoading, salesSummary,
  lang, fmt, inputStyle, onExport,
}: {
  sales: Sale[];
  returns: Sale[];
  salesDate: string;
  setSalesDate: (v: string) => void;
  salesLoading: boolean;
  salesSummary: { totalSales: number; totalItems: number; totalRevenue: number };
  lang: 'ru' | 'uz';
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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
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
    ) : sales.length === 0 && returns.length === 0 ? (
      <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
        <ShoppingCart size={48} style={{ opacity: 0.3, marginBottom: 'var(--space-2)' }} />
        <p>{text.empty[lang]}</p>
      </div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {sales.map((sale, idx) => (
          <AdminSaleRow key={sale.number} sale={sale} index={idx} lang={lang} fmt={fmt} />
        ))}

        {returns.length > 0 && (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, marginTop: 'var(--space-2)',
              fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--warning)',
            }}>
              <RotateCcw size={13} /> {text.returns[lang]} · {returns.length}
            </div>
            {returns.map((ret, idx) => (
              <AdminSaleRow key={ret.number} sale={ret} index={idx} lang={lang} fmt={fmt} isReturn />
            ))}
          </>
        )}
      </div>
    )}
  </>
  );
}

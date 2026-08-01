'use client';

import { Clock, Download, Folder, Plus, Trash } from 'lucide-react';
import type { CSSProperties } from 'react';
import { AdminMovementSummary } from './AdminMovementSummary';
import { AdminMovementForm } from './AdminMovementForm';
import { TYPE_CONFIG, type Movement, type Product } from './movementTypes';

// Вкладка «Движения» склада. Вынесено из AdminMovements: файл перерос
// 200 строк, а две его вкладки друг о друге ничего не знают.

interface Props {
  movements: Movement[];
  loading: boolean;
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  showAdd: boolean;
  setShowAdd: (v: boolean) => void;
  total: number;
  deleting: string | null;
  form: { productId: string; type: string; quantity: string; reason: string; costPrice: string; performedBy: string };
  setForm: React.Dispatch<React.SetStateAction<Props['form']>>;
  products: Product[];
  prodSearch: string;
  setProdSearch: (v: string) => void;
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  todayIn: number;
  todayOut: number;
  todayCost: number;
  fmt: (n: number) => string;
  fmtDate: (d: string) => string;
  inputStyle: CSSProperties;
  onSubmit: () => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onExport: (type: string) => void;
}

export function AdminMovementsTab({
  movements, loading, typeFilter, setTypeFilter, showAdd, setShowAdd, total, deleting,
  form, setForm, products, setProducts, prodSearch, setProdSearch, todayIn, todayOut, todayCost,
  fmt, fmtDate, inputStyle, onSubmit, onDelete, onClearAll, onExport,
}: Props) {
  return (
  <>
<AdminMovementSummary
  total={total}
  todayIn={todayIn}
  todayOut={todayOut}
  todayCost={todayCost}
  fmt={fmt}
/>
    {/* Controls */}
    <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
      <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
        style={{ padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>
        <option value="">Barchasi</option>
        {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
          <option key={key} value={key}>{cfg.label}</option>
        ))}
      </select>
      <div style={{ flex: 1 }} />
      <button onClick={() => onExport('movements')} className="btn btn-outline btn-sm"
        style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--text-xs)' }}>
        <Download size={12} /> CSV
      </button>
      <button onClick={onClearAll} className="btn btn-ghost btn-sm"
        style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--error)', fontSize: 'var(--text-xs)' }}>
        <Trash size={12} /> Tozalash
      </button>
      <button onClick={() => setShowAdd(!showAdd)} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <Plus size={14} /> Qo&apos;shish
      </button>
    </div>

<AdminMovementForm
  showAdd={showAdd}
  setShowAdd={setShowAdd}
  form={form}
  setForm={setForm}
  products={products}
  setProducts={setProducts}
  prodSearch={prodSearch}
  setProdSearch={setProdSearch}
  handleSubmit={onSubmit}
  inputStyle={inputStyle}
/>
    {/* Movements List */}
    {loading ? (
      <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
        <Clock size={32} style={{ animation: 'pulse 1.5s infinite' }} />
      </div>
    ) : movements.length === 0 ? (
      <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
        <Folder size={48} style={{ opacity: 0.3, marginBottom: 'var(--space-2)' }} />
        <p>Harakatlar topilmadi</p>
      </div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {movements.map(m => {
          const cfg = TYPE_CONFIG[m.type] || TYPE_CONFIG.OUT;
          const totalValue = m.costPrice ? Math.abs(m.quantity) * m.costPrice : Math.abs(m.quantity) * m.product.price;
          return (
            <div key={m.id} className="card" style={{ padding: 'var(--space-3)', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
              <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: `${cfg.color}15`, color: cfg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {cfg.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{m.product.nameUz}</span>
                  <span style={{ padding: '1px 6px', borderRadius: 'var(--radius-full)', background: `${cfg.color}15`, color: cfg.color, fontSize: '10px', fontWeight: 700 }}>{cfg.label}</span>
                </div>
                {/* Detail line 1: reason + who */}
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                  {m.reason && <span>{m.reason}</span>}
                  {m.performedBy && <span> · {m.performedBy}</span>}
                  {m.supplier && <span> · {m.supplier.name}</span>}
                </div>
                {/* Detail line 2: time + value + stock after */}
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 1, display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <span>{fmtDate(m.createdAt)}</span>
                  <span>· Qiymati: {fmt(totalValue)} so&apos;m</span>
                  <span>· Omborda: {m.product.stock} dona</span>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-base)', color: m.quantity > 0 ? 'var(--success)' : 'var(--error)' }}>
                  {m.quantity > 0 ? '+' : ''}{m.quantity}
                </span>
                {m.costPrice && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{fmt(m.costPrice)} so&apos;m/d</div>}
                <button onClick={() => onDelete(m.id)} disabled={deleting === m.id}
                  style={{
                    marginTop: 4, background: 'none', border: 'none', color: 'var(--text-muted)',
                    cursor: 'pointer', padding: 2, opacity: deleting === m.id ? 0.3 : 0.5,
                    transition: 'opacity 0.2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
                  title="O'chirish">
                  <Trash size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </>
  );
}

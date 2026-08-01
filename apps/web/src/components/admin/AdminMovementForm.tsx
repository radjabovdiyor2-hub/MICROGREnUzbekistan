'use client';

import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import { Plus } from 'lucide-react';
import { TYPE_CONFIG, type Product } from './AdminMovements';

// Форма движения товара: приход, расход, списание. Показывается по showAdd.

interface MovementDraft {
  productId: string;
  type: string;
  quantity: string;
  reason: string;
  costPrice: string;
  performedBy: string;
}


interface Props {
  showAdd: boolean;
  setShowAdd: (v: boolean) => void;
  form: MovementDraft;
  setForm: Dispatch<SetStateAction<MovementDraft>>;
  products: Product[];
  setProducts: Dispatch<SetStateAction<Product[]>>;
  prodSearch: string;
  setProdSearch: (v: string) => void;
  handleSubmit: () => void;
  inputStyle: CSSProperties;
}

export function AdminMovementForm({ showAdd, setShowAdd, form, setForm, products, setProducts, prodSearch, setProdSearch, handleSubmit, inputStyle }: Props) {
  return (
    <>
    {/* Add Form */}
    {showAdd && (
      <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-3)', borderLeft: '3px solid var(--brand-primary)' }}>
        <h4 style={{ fontWeight: 700, marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-sm)' }}>
          <Plus size={16} /> Yangi harakat
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
          {/* Product search */}
          <div style={{ position: 'relative', gridColumn: '1/-1' }}>
            <input placeholder="Tovar qidirish..." value={prodSearch} onChange={e => { setProdSearch(e.target.value); setForm(f => ({ ...f, productId: '' })); }}
              style={inputStyle} />
            {products.length > 0 && !form.productId && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', zIndex: 10, maxHeight: 200, overflowY: 'auto' }}>
                {products.map(p => (
                  <div key={p.id} onClick={() => { setForm(f => ({ ...f, productId: p.id })); setProdSearch(p.nameUz); setProducts([]); }}
                    style={{ padding: 'var(--space-2) var(--space-3)', cursor: 'pointer', fontSize: 'var(--text-sm)', borderBottom: '1px solid var(--border)' }}>
                    {p.nameUz} <span style={{ color: 'var(--text-muted)' }}>({p.stock} dona)</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={inputStyle}>
            {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
          <input type="number" placeholder="Miqdor *" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} style={inputStyle} />
          <input placeholder="Sabab" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} style={inputStyle} />
          <input placeholder="Kim tomonidan" value={form.performedBy} onChange={e => setForm(f => ({ ...f, performedBy: e.target.value }))} style={inputStyle} />
          {form.type === 'IN' && (
            <input type="number" placeholder="Tan narxi (so'm)" value={form.costPrice} onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))} style={inputStyle} />
          )}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
          <button onClick={handleSubmit} className="btn btn-primary btn-sm" disabled={!form.productId || !form.quantity}>Saqlash</button>
          <button onClick={() => setShowAdd(false)} className="btn btn-ghost btn-sm">Bekor</button>
        </div>
      </div>
    )}
    </>
  );
}

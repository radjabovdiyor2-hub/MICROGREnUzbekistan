'use client';

import React from 'react';
import { Edit, Minus, Plus, Trash } from 'lucide-react';
import type { CartItem } from './AdminPOSTypes';

interface Props {
  cart: CartItem[];
  editingPriceId: string | null;
  setEditingPriceId: (id: string | null) => void;
  editPriceValue: string;
  setEditPriceValue: (v: string) => void;
  updateQuantity: (id: string, delta: number) => void;
  updatePrice: (id: string, newPrice: number) => void;
  removeFromCart: (id: string) => void;
  fmt: (n: number) => string;
}

export function AdminPOSCartItems({
  cart, editingPriceId, setEditingPriceId, editPriceValue, setEditPriceValue,
  updateQuantity, updatePrice, removeFromCart, fmt,
}: Props) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', marginBottom: 'var(--space-4)' }}>
      {cart.map(item => {
        const priceChanged = item.customPrice !== item.product.price;
        const isEditing = editingPriceId === item.product.id;
        const belowCost = item.product.costPrice && item.customPrice < item.product.costPrice;
        return (
          <div key={item.product.id} style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
            padding: '12px 0', borderBottom: '1px solid var(--border)',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {item.product.nameUz}
                {belowCost && <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '6px', background: 'color-mix(in srgb, var(--error) 15%, transparent)', color: 'var(--error)', fontWeight: 800 }}>УБЫТОК</span>}
              </div>
              {isEditing ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input type="number" value={editPriceValue}
                    onChange={e => setEditPriceValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const v = parseInt(editPriceValue);
                        if (v > 0) updatePrice(item.product.id, v);
                        setEditingPriceId(null);
                      } else if (e.key === 'Escape') setEditingPriceId(null);
                    }}
                    onBlur={() => {
                      const v = parseInt(editPriceValue);
                      if (v > 0) updatePrice(item.product.id, v);
                      setEditingPriceId(null);
                    }}
                    style={{ width: 90, padding: '4px 8px', border: '2px solid var(--brand-primary)', borderRadius: '8px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 700, outline: 'none' }}
                  />
                </div>
              ) : (
                <div onClick={() => { setEditingPriceId(item.product.id); setEditPriceValue(String(item.customPrice)); }}
                  style={{ fontSize: 'var(--text-xs)', color: priceChanged ? 'var(--warning)' : 'var(--brand-primary)', fontWeight: 'var(--font-bold)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {fmt(item.customPrice * item.quantity)} сум
                  <Edit size={10} style={{ opacity: 0.5 }} />
                  {priceChanged && <span style={{ fontSize: '9px', color: 'var(--warning)', textDecoration: 'line-through', opacity: 0.6 }}>{fmt(item.product.price)}</span>}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button onClick={() => updateQuantity(item.product.id, -1)} className="btn btn-ghost btn-sm"
                style={{ width: 32, height: 32, padding: 0, borderRadius: '10px' }}>
                <Minus size={14} />
              </button>
              <span style={{ fontWeight: 'var(--font-bold)', minWidth: 24, textAlign: 'center', fontSize: '15px' }}>{item.quantity}</span>
              <button onClick={() => updateQuantity(item.product.id, 1)} className="btn btn-ghost btn-sm"
                style={{ width: 32, height: 32, padding: 0, borderRadius: '10px' }}>
                <Plus size={14} />
              </button>
            </div>
            <button onClick={() => removeFromCart(item.product.id)} className="btn btn-ghost btn-sm"
              style={{ color: 'var(--error)', width: 32, height: 32, padding: 0, borderRadius: '10px' }}>
              <Trash size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

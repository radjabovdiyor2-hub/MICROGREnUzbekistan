'use client';

import React, { useState } from 'react';
import { Edit, Minus, Plus, Trash } from 'lucide-react';
import { formatQty, isValidQty, normalizeQty, stepFor } from '@/lib/qty';
import type { CartItem } from './AdminPOSTypes';

// Одна позиция чека. Вынесено из AdminPOSCartItems: файл перерастал 200 строк,
// когда количество стало редактируемым — у него та же механика «клик → поле →
// Enter/Escape/blur», что у цены, и вдвоём они занимают почти весь файл.

interface Props {
  item: CartItem;
  editingPriceId: string | null;
  setEditingPriceId: (id: string | null) => void;
  editPriceValue: string;
  setEditPriceValue: (v: string) => void;
  updateQuantity: (id: string, direction: number) => void;
  setQuantity: (id: string, value: number) => void;
  updatePrice: (id: string, newPrice: number) => void;
  setPriceReason: (id: string, reason: string) => void;
  removeFromCart: (id: string) => void;
  fmt: (n: number) => string;
}

const editInputStyle: React.CSSProperties = {
  padding: '4px 8px', border: '2px solid var(--brand-primary)', borderRadius: '8px',
  background: 'var(--bg-secondary)', color: 'var(--text-primary)',
  fontSize: '13px', fontWeight: 700, outline: 'none', textAlign: 'center',
};

export function AdminPOSCartRow({
  item, editingPriceId, setEditingPriceId, editPriceValue, setEditPriceValue,
  updateQuantity, setQuantity, updatePrice, setPriceReason, removeFromCart, fmt,
}: Props) {
  const [editingQty, setEditingQty] = useState(false);
  const [qtyDraft, setQtyDraft] = useState('');

  const priceChanged = item.customPrice !== item.product.price;
  const isEditingPrice = editingPriceId === item.product.id;
  const belowCost = item.product.costPrice && item.customPrice < item.product.costPrice;
  const step = stepFor(item.product.unit);

  const commitQty = () => {
    // Запятая — то, что продавец набирает на цифровом блоке; parseFloat её
    // не понимает и вернул бы «1» из «1,3», молча продав втрое меньше.
    const parsed = normalizeQty(parseFloat(qtyDraft.replace(',', '.')));
    if (isValidQty(parsed)) setQuantity(item.product.id, parsed);
    setEditingQty(false);
  };

  const commitPrice = () => {
    const v = parseInt(editPriceValue);
    if (v > 0) updatePrice(item.product.id, v);
    setEditingPriceId(null);
  };

  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {item.product.nameUz}
          {belowCost && <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '6px', background: 'color-mix(in srgb, var(--error) 15%, transparent)', color: 'var(--error)', fontWeight: 800 }}>УБЫТОК</span>}
        </div>
        {isEditingPrice ? (
          <input type="number" value={editPriceValue} autoFocus
            onChange={e => setEditPriceValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitPrice();
              else if (e.key === 'Escape') setEditingPriceId(null);
            }}
            onBlur={commitPrice}
            style={{ ...editInputStyle, width: 90 }}
          />
        ) : (
          <div onClick={() => { setEditingPriceId(item.product.id); setEditPriceValue(String(item.customPrice)); }}
            style={{ fontSize: 'var(--text-xs)', color: priceChanged ? 'var(--warning)' : 'var(--brand-primary)', fontWeight: 'var(--font-bold)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {fmt(Math.round(item.customPrice * item.quantity))} сум
            <Edit size={10} style={{ opacity: 0.5 }} />
            {priceChanged && <span style={{ fontSize: '9px', color: 'var(--warning)', textDecoration: 'line-through', opacity: 0.6 }}>{fmt(item.product.price)}</span>}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <button onClick={() => updateQuantity(item.product.id, -1)} className="btn btn-ghost btn-sm"
          style={{ width: 32, height: 32, padding: 0, borderRadius: '10px' }}
          title={'-' + formatQty(step)}>
          <Minus size={14} />
        </button>
        {/* Количество с единицей: «2» само по себе не говорит, два это
            лотка или два килограмма, а цена у них разная на порядок.
            Клик открывает ввод числом — 1.3 кнопками по 0.1 не набирают. */}
        {editingQty ? (
          <input type="text" inputMode="decimal" value={qtyDraft} autoFocus
            onChange={e => setQtyDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitQty();
              else if (e.key === 'Escape') setEditingQty(false);
            }}
            onBlur={commitQty}
            style={{ ...editInputStyle, width: 64 }}
          />
        ) : (
          <span onClick={() => { setEditingQty(true); setQtyDraft(formatQty(item.quantity)); }}
            style={{ fontWeight: 'var(--font-bold)', minWidth: 40, textAlign: 'center', fontSize: '15px', cursor: 'pointer' }}>
            {formatQty(item.quantity)}
            {item.product.unit && (
              <span style={{ display: 'block', fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)' }}>
                {item.product.unit}
              </span>
            )}
          </span>
        )}
        <button onClick={() => updateQuantity(item.product.id, 1)} className="btn btn-ghost btn-sm"
          style={{ width: 32, height: 32, padding: 0, borderRadius: '10px' }}
          title={'+' + formatQty(step)}>
          <Plus size={14} />
        </button>
      </div>
      <button onClick={() => removeFromCart(item.product.id)} className="btn btn-ghost btn-sm"
        style={{ color: 'var(--error)', width: 32, height: 32, padding: 0, borderRadius: '10px' }}>
        <Trash size={14} />
      </button>
    </div>

    {/* Причина уступки. Появляется только когда цена отличается от прайса:
        сервер без неё продажу не примет, и лучше спросить здесь, чем
        показать отказ после нажатия «Продать». */}
    {priceChanged && (
      <input type="text" placeholder="Почему уступили? (опт, постоянный клиент...)"
        value={item.priceReason ?? ''}
        onChange={e => setPriceReason(item.product.id, e.target.value)}
        style={{
          width: '100%', marginTop: '8px', padding: '6px 10px',
          border: '1.5px solid var(--warning)', borderRadius: '8px',
          background: 'var(--bg-primary)', color: 'var(--text-primary)',
          fontSize: '12px', outline: 'none',
        }}
      />
    )}
    </div>
  );
}

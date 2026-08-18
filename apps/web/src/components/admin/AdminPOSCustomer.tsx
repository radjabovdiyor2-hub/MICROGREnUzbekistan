'use client';

import { useEffect, useState } from 'react';
import { UserRound, X } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { ContractPrice, PosCustomer } from './AdminPOSTypes';

// Выбор покупателя в чеке — ради договорных цен.
//
// Раньше покупателя в чеке не было вовсе (только имя должника), и цену
// ресторану продавец правил руками при каждой продаже. Договорённость жила
// в его памяти: из данных нельзя было отличить её от разовой уступки.

interface Props {
  customer: PosCustomer | null;
  onPick: (customer: PosCustomer | null, prices: Map<string, ContractPrice>) => void;
  inputStyle: CSSProperties;
}

interface Found {
  id: number;
  name: string | null;
  companyName: string | null;
  phone: string | null;
}

const label = (c: Found | PosCustomer) =>
  ('companyName' in c ? c.companyName : null) || c.name || c.phone || `#${c.id}`;

export function AdminPOSCustomer({ customer, onPick, inputStyle }: Props) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Found[]>([]);
  const [loading, setLoading] = useState(false);

  // Короткий запрос и выбранный покупатель гасят подсказки ВЫЧИСЛЕНИЕМ
  // ниже, а не сбросом состояния из эффекта: сброс вызывает лишний каскад
  // отрисовок и ругается линтер.
  const active = !customer && query.trim().length >= 2;

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/inventory/customers?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        setFound(data.customers ?? []);
      } catch {
        setFound([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, active]);

  const visible = active ? found : [];

  const pick = async (row: Found) => {
    const picked: PosCustomer = { id: row.id, name: label(row), phone: row.phone };
    // Цены тянем сразу при выборе: подставлять их при каждом добавлении
    // товара значило бы дёргать сервер на каждое нажатие.
    let prices = new Map<string, ContractPrice>();
    try {
      const res = await fetch(`/api/inventory/customers/prices?customerId=${row.id}`);
      const data = await res.json();
      prices = new Map(
        (data.prices ?? []).map((p: { productId: string; price: number; note: string | null }) =>
          [p.productId, { price: p.price, note: p.note }] as const),
      );
    } catch {
      // Цены не доехали — продажа всё равно проходит, просто по прайсу.
    }
    setQuery('');
    setFound([]);
    onPick(picked, prices);
  };

  if (customer) {
    return (
      <div style={{
        marginBottom: 'var(--space-3)', padding: '10px 12px',
        border: '1.5px solid var(--brand-primary)', borderRadius: '12px',
        background: 'var(--brand-primary-light)', display: 'flex',
        alignItems: 'center', gap: '8px', fontSize: 'var(--text-sm)', fontWeight: 600,
      }}>
        <UserRound size={16} />
        <span style={{ flex: 1, minWidth: 0 }}>{customer.name}</span>
        <button type="button" onClick={() => onPick(null, new Map())}
          className="btn btn-ghost btn-sm"
          style={{ width: 28, height: 28, padding: 0, borderRadius: '8px' }}>
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 'var(--space-3)' }}>
      <input type="text" placeholder="Покупатель (для договорной цены)..."
        value={query} onChange={e => setQuery(e.target.value)} style={inputStyle} />
      {loading && active && (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 4 }}>Поиск...</div>
      )}
      {visible.length > 0 && (
        <div style={{
          marginTop: 4, border: '1.5px solid var(--border)', borderRadius: '10px',
          overflow: 'hidden', background: 'var(--bg-primary)',
        }}>
          {visible.map(row => (
            <button key={row.id} type="button" onClick={() => pick(row)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 'var(--text-sm)', color: 'var(--text-primary)',
              }}>
              {label(row)}
              {row.phone && (
                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}> · {row.phone}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

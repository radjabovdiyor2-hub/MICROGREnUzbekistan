'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Tag, Trash } from 'lucide-react';

// Договорные цены клиента: то, по чём этот ресторан берёт товар.
//
// Раньше договорённость жила в памяти продавца — он правил цену в чеке при
// каждой продаже и начинал заново при следующей. Здесь она записана, и касса
// подставляет её сама при выборе покупателя.

interface PriceRow {
  id: string;
  productId: string;
  price: number;
  note: string | null;
  product: { nameUz: string; nameRu: string; unit: string; price: number };
}

interface ProductRow {
  id: string;
  nameUz: string;
  nameRu: string;
  unit?: string | null;
  price: number;
}

const fmt = (n: number) => n.toLocaleString('ru-RU');

export function AdminCustomerPrices({ customerId }: { customerId: number }) {
  const qc = useQueryClient();
  const [productId, setProductId] = useState('');
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');

  const key = ['customer-prices', customerId];

  const { data: prices = [], isLoading } = useQuery<PriceRow[]>({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(`/api/inventory/customers/prices?customerId=${customerId}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Не удалось загрузить цены');
      return body.prices as PriceRow[];
    },
  });

  const { data: products = [] } = useQuery<ProductRow[]>({
    queryKey: ['products-for-prices'],
    queryFn: async () => {
      const res = await fetch('/api/products?limit=200');
      const body = await res.json();
      return (body.items ?? []) as ProductRow[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/inventory/customers/prices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, productId, price: Number(price), note }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Не удалось сохранить');
      return body;
    },
    onSuccess: () => {
      setProductId(''); setPrice(''); setNote('');
      qc.invalidateQueries({ queryKey: key });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/inventory/customers/prices?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Не удалось удалить');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const inputStyle = {
    padding: '8px 10px', border: '1.5px solid var(--border)', borderRadius: '8px',
    background: 'var(--bg-primary)', color: 'var(--text-primary)',
    fontSize: 'var(--text-sm)', outline: 'none',
  };

  return (
    <section style={{ marginTop: 'var(--space-5)' }}>
      <h4 style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-3)',
      }}>
        <Tag size={16} /> Договорные цены
      </h4>

      {isLoading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Загрузка...</div>
      ) : prices.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
          Договорённостей нет — клиент берёт по прайсу.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '6px', marginBottom: 'var(--space-3)' }}>
          {prices.map(row => (
            <div key={row.id} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '10px',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{row.product.nameRu}</div>
                {row.note && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{row.note}</div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, color: 'var(--brand-primary)' }}>
                  {fmt(row.price)} / {row.product.unit}
                </div>
                {/* Прайс рядом: без него не видно, уступка это или наценка. */}
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                  {fmt(row.product.price)}
                </div>
              </div>
              <button onClick={() => remove.mutate(row.id)} className="btn btn-ghost btn-sm"
                style={{ color: 'var(--error)', width: 30, height: 30, padding: 0 }}>
                <Trash size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <select value={productId} onChange={e => setProductId(e.target.value)}
          style={{ ...inputStyle, flex: '1 1 180px' }}>
          <option value="">Товар...</option>
          {products.map(p => (
            <option key={p.id} value={p.id}>{p.nameRu} — {fmt(p.price)}</option>
          ))}
        </select>
        <input type="number" placeholder="Цена" value={price}
          onChange={e => setPrice(e.target.value)} style={{ ...inputStyle, width: 110 }} />
        <input type="text" placeholder="Обоснование" value={note}
          onChange={e => setNote(e.target.value)} style={{ ...inputStyle, flex: '1 1 160px' }} />
        <button className="btn btn-primary btn-sm"
          disabled={!productId || Number(price) <= 0 || save.isPending}
          onClick={() => save.mutate()}>
          Сохранить
        </button>
      </div>
      {save.error && (
        <div style={{ color: 'var(--error)', fontSize: 'var(--text-xs)', marginTop: 6 }}>
          {(save.error as Error).message}
        </div>
      )}
    </section>
  );
}

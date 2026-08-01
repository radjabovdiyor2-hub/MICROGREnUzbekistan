'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Clock, Edit, Plus, Trash, Truck,
} from 'lucide-react';

interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  note: string | null;
  isActive: boolean;
  totalDeliveries: number;
  totalPurchased: number;
  currentDebt: number;
  createdAt: string;
}

export function AdminSuppliers() {
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', address: '', note: '' });
  const queryClient = useQueryClient();
  const { data: suppliers = [], isLoading: loading } = useQuery<Supplier[]>({
    queryKey: ['admin-suppliers'],
    queryFn: async () => {
      const res = await fetch('/api/inventory/suppliers');
      const data = await res.json();
      return data.suppliers || [];
    }
  });

  const fetch_ = () => queryClient.invalidateQueries({ queryKey: ['admin-suppliers'] });

  const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

  const handleSave = async () => {
    if (!form.name) return;
    try {
      if (editId) {
        await fetch('/api/inventory/suppliers', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editId, ...form }),
        });
      } else {
        await fetch('/api/inventory/suppliers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
      }
      setShowAdd(false);
      setEditId(null);
      setForm({ name: '', phone: '', address: '', note: '' });
      fetch_();
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("O'chirishni tasdiqlaysizmi?")) return;
    await fetch(`/api/inventory/suppliers?id=${id}`, { method: 'DELETE' });
    fetch_();
  };

  const startEdit = (s: Supplier) => {
    setEditId(s.id);
    setForm({ name: s.name, phone: s.phone || '', address: s.address || '', note: s.note || '' });
    setShowAdd(true);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Truck size={20} /> Yetkazuvchilar
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 'var(--font-normal)' }}>({suppliers.length})</span>
        </h3>
        <button onClick={() => { setShowAdd(!showAdd); setEditId(null); setForm({ name: '', phone: '', address: '', note: '' }); }}
          className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Plus size={14} /> Yangi
        </button>
      </div>

      {/* Add/Edit Form */}
      {showAdd && (
        <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
          <h4 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-3)' }}>
            {editId ? 'Tahrirlash' : 'Yangi yetkazuvchi'}
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
            <input placeholder="Nom *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              style={{ padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }} />
            <input placeholder="Telefon" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              style={{ padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }} />
            <input placeholder="Manzil" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              style={{ padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }} />
            <input placeholder="Izoh" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              style={{ padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }} />
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
            <button onClick={handleSave} className="btn btn-primary btn-sm">Saqlash</button>
            <button onClick={() => { setShowAdd(false); setEditId(null); }} className="btn btn-ghost btn-sm">Bekor</button>
          </div>
        </div>
      )}

      {/* Suppliers List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
          <Clock size={32} style={{ animation: 'pulse 1.5s infinite' }} />
        </div>
      ) : suppliers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
          <Truck size={48} style={{ opacity: 0.3, marginBottom: 'var(--space-2)' }} />
          <p>Yetkazuvchilar yo&apos;q</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {suppliers.map(s => (
            <div key={s.id} className="card" style={{ padding: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-lg)', background: 'var(--brand-primary-light)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Truck size={22} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 'var(--font-bold)' }}>{s.name}</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    {s.phone && `${s.phone}`}{s.address && ` · ${s.address}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button onClick={() => startEdit(s)} className="btn btn-ghost btn-sm" style={{ width: 28, height: 28, padding: 0 }}>
                    <Edit size={14} />
                  </button>
                  <button onClick={() => handleDelete(s.id)} className="btn btn-ghost btn-sm" style={{ width: 28, height: 28, padding: 0, color: 'var(--error)' }}>
                    <Trash size={14} />
                  </button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }}>
                <div style={{ textAlign: 'center', padding: 'var(--space-2)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Yetkazishlar</div>
                  <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-sm)' }}>{s.totalDeliveries}</div>
                </div>
                <div style={{ textAlign: 'center', padding: 'var(--space-2)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Xaridlar</div>
                  <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-sm)' }}>{fmt(s.totalPurchased)}</div>
                </div>
                <div style={{ textAlign: 'center', padding: 'var(--space-2)', background: s.currentDebt > 0 ? 'var(--error-bg)' : 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Qarz</div>
                  <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-sm)', color: s.currentDebt > 0 ? 'var(--error)' : 'var(--success)' }}>
                    {s.currentDebt > 0 ? fmt(s.currentDebt) : '0'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

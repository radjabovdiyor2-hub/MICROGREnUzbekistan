'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Clock, Edit, Plus, Trash, User,
} from 'lucide-react';
import { CITIES, DEPARTMENTS } from './employeeOptions';

interface Employee {
  id: string;
  name: string;
  phone: string | null;
  role: string;
  department: string | null;
  city: string | null;
  isActive: boolean;
  todaySalesCount: number;
  todayRevenue: number;
}

const EMPTY_EMPLOYEE = {
  name: '', pin: '', phone: '', role: 'seller', department: '', city: 'samarqand',
};

export function AdminEmployees() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_EMPLOYEE);

  const { data: employees = [], isLoading: loading } = useQuery<Employee[]>({
    queryKey: ['admin-employees'],
    queryFn: async () => {
      const res = await fetch('/api/inventory/employees');
      const data = await res.json();
      return data.employees || [];
    }
  });

  const fetch_ = () => queryClient.invalidateQueries({ queryKey: ['admin-employees'] });

  const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

  const handleSave = async () => {
    if (!form.name || (!editId && !form.pin)) return;
    try {
      const method = editId ? 'PUT' : 'POST';
      const body = editId ? { id: editId, ...form } : form;
      const res = await fetch('/api/inventory/employees', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setShowAdd(false);
        setEditId(null);
        setForm(EMPTY_EMPLOYEE);
        fetch_();
      } else {
        alert(data.error || 'Xatolik');
      }
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("O'chirishni tasdiqlaysizmi?")) return;
    await fetch(`/api/inventory/employees?id=${id}`, { method: 'DELETE' });
    fetch_();
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <User size={20} /> Xodimlar
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 'var(--font-normal)' }}>({employees.length})</span>
        </h3>
        <button onClick={() => { setShowAdd(!showAdd); setEditId(null); setForm(EMPTY_EMPLOYEE); }}
          className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Plus size={14} /> Yangi xodim
        </button>
      </div>

      {/* Add/Edit Form */}
      {showAdd && (
        <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
          <h4 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-3)' }}>
            {editId ? 'Tahrirlash' : 'Yangi xodim'}
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
            <input placeholder="Ism *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              style={{ padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }} />
            <input placeholder="PIN (4 raqam) *" value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))} maxLength={4}
              style={{ padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-display)', letterSpacing: 8 }} />
            <input placeholder="Telefon" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              style={{ padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }} />
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              style={{ padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>
              <option value="seller">Sotuvchi</option>
              <option value="manager">Menejer</option>
            </select>
            {/* Отдел и город: колонки в базе есть, график смен их показывает,
                а задать их было негде — поэтому они всегда оставались пустыми. */}
            <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
              style={{ padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>
              <option value="">Bo&apos;lim…</option>
              {DEPARTMENTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            <select value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
              style={{ padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>
              {CITIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
            <button onClick={handleSave} className="btn btn-primary btn-sm">Saqlash</button>
            <button onClick={() => { setShowAdd(false); setEditId(null); }} className="btn btn-ghost btn-sm">Bekor</button>
          </div>
        </div>
      )}

      {/* Employee Cards */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
          <Clock size={32} style={{ animation: 'pulse 1.5s infinite' }} />
        </div>
      ) : employees.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
          <User size={48} style={{ opacity: 0.3, marginBottom: 'var(--space-2)' }} />
          <p>Xodimlar yo&apos;q. Yangi xodim qo&apos;shing.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {employees.map(emp => (
            <div key={emp.id} className="card" style={{ padding: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-full)', background: 'var(--brand-primary-light)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'var(--font-extrabold)', fontSize: 'var(--text-lg)', fontFamily: 'var(--font-display)' }}>
                  {emp.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 'var(--font-bold)' }}>{emp.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                    <span style={{ padding: '1px 6px', borderRadius: 'var(--radius-full)', background: emp.role === 'manager' ? 'var(--info-bg)' : 'var(--success-bg)', color: emp.role === 'manager' ? 'var(--info)' : 'var(--success)', fontSize: '10px', fontWeight: 'var(--font-bold)' }}>
                      {emp.role === 'manager' ? 'Menejer' : 'Sotuvchi'}
                    </span>
                    {emp.phone && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{emp.phone}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button onClick={() => { setEditId(emp.id); setForm({ name: emp.name, pin: '', phone: emp.phone || '', role: emp.role, department: emp.department || '', city: emp.city || 'samarqand' }); setShowAdd(true); }}
                    className="btn btn-ghost btn-sm" style={{ width: 28, height: 28, padding: 0 }}>
                    <Edit size={14} />
                  </button>
                  <button onClick={() => handleDelete(emp.id)}
                    className="btn btn-ghost btn-sm" style={{ width: 28, height: 28, padding: 0, color: 'var(--error)' }}>
                    <Trash size={14} />
                  </button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                <div style={{ textAlign: 'center', padding: 'var(--space-2)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Bugungi sotish</div>
                  <div style={{ fontWeight: 'var(--font-bold)' }}>{emp.todaySalesCount} ta</div>
                </div>
                <div style={{ textAlign: 'center', padding: 'var(--space-2)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Bugungi tushum</div>
                  <div style={{ fontWeight: 'var(--font-bold)', color: 'var(--success)' }}>{fmt(emp.todayRevenue)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

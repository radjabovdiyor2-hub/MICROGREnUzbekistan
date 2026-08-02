'use client';

import { useState } from 'react';
import { Calendar, Clock, User, FileText, Plus, Edit, Trash } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface Employee {
  id: string;
  name: string;
  department: string | null;
}

interface Shift {
  id: string;
  employeeId: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  type: string;
  note: string | null;
  employee?: {
    name: string;
    department: string | null;
  };
}

export function AdminShifts() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ employeeId: '', date: '', startTime: '', endTime: '', type: 'work', note: '' });

  const { data: shifts = [], isLoading: loading } = useQuery<Shift[]>({
    queryKey: ['admin-shifts'],
    queryFn: async () => {
      const res = await fetch('/api/admin/shifts');
      const data = await res.json();
      return data.shifts || [];
    }
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['admin-employees-list'],
    queryFn: async () => {
      const res = await fetch('/api/inventory/employees');
      const data = await res.json();
      return data.employees || [];
    }
  });

  const fetch_ = () => queryClient.invalidateQueries({ queryKey: ['admin-shifts'] });

  const handleSave = async () => {
    if (!form.employeeId || !form.date) return alert("Iltimos, xodim va sanani kiriting");
    
    try {
      const method = editId ? 'PUT' : 'POST';
      
      const payload: Record<string, unknown> = {
        employeeId: form.employeeId,
        date: form.date,
        type: form.type,
        note: form.note,
      };
      
      if (editId) payload.id = editId;
      
      if (form.startTime) {
        payload.startTime = new Date(`${form.date}T${form.startTime}:00`).toISOString();
      }
      
      if (form.endTime) {
        payload.endTime = new Date(`${form.date}T${form.endTime}:00`).toISOString();
      }

      const res = await fetch('/api/admin/shifts', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      
      if (data.success) {
        setShowAdd(false);
        setEditId(null);
        setForm({ employeeId: '', date: '', startTime: '', endTime: '', type: 'work', note: '' });
        fetch_();
      } else {
        alert(data.error || "Xatolik");
      }
    } catch (err) {
      console.error(err);
      alert("Xatolik yuz berdi");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("O&apos;chirishni tasdiqlaysizmi?")) return;
    await fetch(`/api/admin/shifts?id=${id}`, { method: 'DELETE' });
    fetch_();
  };

  const startEdit = (shift: Shift) => {
    setEditId(shift.id);
    
    // YYYY-MM-DD
    const dateStr = new Date(shift.date).toISOString().split('T')[0];
    
    let st = '';
    if (shift.startTime) {
      const d = new Date(shift.startTime);
      st = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    }
    
    let et = '';
    if (shift.endTime) {
      const d = new Date(shift.endTime);
      et = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    }

    setForm({
      employeeId: shift.employeeId,
      date: dateStr,
      startTime: st,
      endTime: et,
      type: shift.type,
      note: shift.note || '',
    });
    
    setShowAdd(true);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Calendar size={24} /> Grafika (Smenalar)
        </h2>
        <button 
          onClick={() => { setShowAdd(!showAdd); setEditId(null); setForm({ employeeId: '', date: new Date().toISOString().split('T')[0], startTime: '', endTime: '', type: 'work', note: '' }); }}
          className="btn btn-primary btn-sm" style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <Plus size={16} /> Smena qo&apos;shish
        </button>
      </div>

      {showAdd && (
        <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
          <h4 style={{ fontWeight: 'bold', marginBottom: 'var(--space-3)' }}>
            {editId ? 'Smenani tahrirlash' : 'Yangi smena'}
          </h4>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Xodim *</label>
              <select 
                value={form.employeeId} 
                onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}
                style={{ width: '100%', padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
              >
                <option value="">Tanlang...</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Sana *</label>
              <input 
                type="date" 
                value={form.date} 
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                style={{ width: '100%', padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} 
              />
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Boshlanish vaqti</label>
              <input 
                type="time" 
                value={form.startTime} 
                onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                style={{ width: '100%', padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} 
              />
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Tugash vaqti</label>
              <input 
                type="time" 
                value={form.endTime} 
                onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                style={{ width: '100%', padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} 
              />
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Turi</label>
              <select 
                value={form.type} 
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                style={{ width: '100%', padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
              >
                <option value="work">Ish</option>
                <option value="sick">Kasallik varaqasi (Bolnichniy)</option>
                <option value="vacation">Ta&apos;til (Otpusk)</option>
              </select>
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Izoh</label>
              <input 
                type="text" 
                placeholder="Qo'shimcha izoh..."
                value={form.note} 
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                style={{ width: '100%', padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} 
              />
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button onClick={handleSave} className="btn btn-primary btn-sm">Saqlash</button>
            <button onClick={() => { setShowAdd(false); setEditId(null); }} className="btn btn-ghost btn-sm">Bekor qilish</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {loading ? (
           <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
             <Clock size={32} style={{ animation: 'pulse 1.5s infinite' }} />
           </div>
        ) : shifts.length === 0 ? (
          <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
            Smenalar topilmadi
          </div>
        ) : (
          shifts.map(shift => (
            <div key={shift.id} className="card" style={{ padding: 'var(--space-4)', borderLeft: `4px solid ${shift.type === 'work' ? 'var(--brand-primary)' : shift.type === 'sick' ? 'var(--error)' : 'var(--warning)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                <div>
                  <h3 style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <User size={16} /> {shift.employee?.name || shift.employeeId}
                  </h3>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    Bo&apos;lim: {shift.employee?.department || "Noma'lum"}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <span style={{ 
                    padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold',
                    background: shift.type === 'work' ? 'var(--info-bg)' : shift.type === 'sick' ? 'var(--error-bg)' : 'var(--warning-bg)',
                    color: shift.type === 'work' ? 'var(--info)' : shift.type === 'sick' ? 'var(--error)' : 'var(--warning)'
                  }}>
                    {shift.type === 'work' ? 'Ish' : shift.type === 'sick' ? 'Bolnichniy' : 'Otpusk'}
                  </span>
                  
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => startEdit(shift)} className="btn btn-ghost btn-sm" style={{ padding: '4px' }}>
                      <Edit size={16} />
                    </button>
                    <button onClick={() => handleDelete(shift.id)} className="btn btn-ghost btn-sm" style={{ padding: '4px', color: 'var(--error)' }}>
                      <Trash size={16} />
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-4)', fontSize: '14px', marginBottom: 'var(--space-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={14} color="var(--text-muted)" />
                  {new Date(shift.date).toLocaleDateString('ru-RU')}
                </div>
                {(shift.startTime || shift.endTime) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={14} color="var(--text-muted)" />
                    {shift.startTime ? new Date(shift.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '...'} 
                    {' — '} 
                    {shift.endTime ? new Date(shift.endTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '...'}
                  </div>
                )}
              </div>

              {shift.note && (
                <div style={{ display: 'flex', gap: '6px', fontSize: '13px', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: 'var(--space-2)', borderRadius: 'var(--radius-md)' }}>
                  <FileText size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>{shift.note}</div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

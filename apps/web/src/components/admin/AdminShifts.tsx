'use client';

import { useState, useEffect } from 'react';
import { Calendar, Clock, User, FileText } from 'lucide-react';

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
    department: string;
  };
}

export function AdminShifts() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/admin/shifts');
        const data = await res.json();
        if (active && data.shifts) setShifts(data.shifts);
      } catch (err) {
        // ignore
      } finally {
        if (active) setLoading(false);
      }
    };
    
    fetchData();
      
    return () => { active = false; };
  }, []);

  if (loading) return <div>Загрузка расписания...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Calendar size={24} /> График Смен (Сотрудники)
        </h2>
        <button className="btn btn-primary btn-sm">Назначить смену</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {shifts.length === 0 ? (
          <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
            Смены не найдены
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
                    Отдел: {shift.employee?.department || 'Неизвестно'}
                  </div>
                </div>
                <div>
                  <span style={{ 
                    padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold',
                    background: shift.type === 'work' ? 'var(--info-bg)' : shift.type === 'sick' ? 'var(--error-bg)' : 'var(--warning-bg)',
                    color: shift.type === 'work' ? 'var(--info)' : shift.type === 'sick' ? 'var(--error)' : 'var(--warning)'
                  }}>
                    {shift.type === 'work' ? 'Рабочая смена' : shift.type === 'sick' ? 'Больничный' : 'Отпуск'}
                  </span>
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

'use client';

import { Calendar, Clock, Edit, FileText, Trash, User } from 'lucide-react';
import { type Shift, shiftType } from './shiftTypes';

// Карточка одной смены. Вынесена из AdminShifts.tsx.

interface Props {
  shift: Shift;
  onEdit: (shift: Shift) => void;
  onDelete: (id: string) => void;
}

function hhmm(value: string | null): string {
  if (!value) return '…';
  return new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function AdminShiftCard({ shift, onEdit, onDelete }: Props) {
  const type = shiftType(shift.type);

  return (
    <div className="card" style={{ padding: 'var(--space-4)', borderLeft: `4px solid ${type.color}` }}>
      {/* flexWrap: имя сотрудника и блок действий на телефоне не помещались
          в строку и расталкивали карточку шире экрана. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontWeight: 'var(--font-bold)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <User size={16} /> {shift.employee?.name || shift.employeeId}
          </h3>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            Bo&apos;lim: {shift.employee?.department || "Noma'lum"}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{
            padding: '4px 8px', borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)',
            whiteSpace: 'nowrap', background: type.bg, color: type.color,
          }}>
            {type.label}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => onEdit(shift)} className="btn btn-ghost btn-sm"
              style={{ padding: 4 }} aria-label="Изменить">
              <Edit size={16} />
            </button>
            <button onClick={() => onDelete(shift.id)} className="btn btn-ghost btn-sm"
              style={{ padding: 4, color: 'var(--error)' }} aria-label="Удалить">
              <Trash size={16} />
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Calendar size={14} color="var(--text-muted)" />
          {new Date(shift.date).toLocaleDateString('ru-RU')}
        </div>
        {(shift.startTime || shift.endTime) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={14} color="var(--text-muted)" />
            {hhmm(shift.startTime)} — {hhmm(shift.endTime)}
          </div>
        )}
      </div>

      {shift.note && (
        <div style={{ display: 'flex', gap: 6, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: 'var(--space-2)', borderRadius: 'var(--radius-md)' }}>
          <FileText size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{shift.note}</div>
        </div>
      )}
    </div>
  );
}

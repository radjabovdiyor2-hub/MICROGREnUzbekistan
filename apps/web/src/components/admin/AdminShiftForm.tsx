'use client';

import type { Dispatch, SetStateAction } from 'react';
import { type Employee, type ShiftForm, shiftField, shiftLabel } from './shiftTypes';

// Форма смены. Вынесена из AdminShifts.tsx — там она занимала 80 строк.

interface Props {
  employees: Employee[];
  form: ShiftForm;
  setForm: Dispatch<SetStateAction<ShiftForm>>;
  editId: string | null;
  onSave: () => void;
  onCancel: () => void;
}

export function AdminShiftForm({ employees, form, setForm, editId, onSave, onCancel }: Props) {
  const set = (patch: Partial<ShiftForm>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
      <h4 style={{ fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-3)' }}>
        {editId ? 'Smenani tahrirlash' : 'Yangi smena'}
      </h4>

      {/* auto-fit: на телефоне поля становятся в одну колонку сами,
          фиксированные две вылезали за экран. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
        <div>
          <label style={shiftLabel} htmlFor="shift-emp">Xodim *</label>
          <select id="shift-emp" value={form.employeeId}
            onChange={(e) => set({ employeeId: e.target.value })} style={shiftField}>
            <option value="">Tanlang…</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={shiftLabel} htmlFor="shift-date">Sana *</label>
          <input id="shift-date" type="date" value={form.date}
            onChange={(e) => set({ date: e.target.value })} style={shiftField} />
        </div>

        <div>
          <label style={shiftLabel} htmlFor="shift-start">Boshlanish vaqti</label>
          <input id="shift-start" type="time" value={form.startTime}
            onChange={(e) => set({ startTime: e.target.value })} style={shiftField} />
        </div>

        <div>
          <label style={shiftLabel} htmlFor="shift-end">Tugash vaqti</label>
          <input id="shift-end" type="time" value={form.endTime}
            onChange={(e) => set({ endTime: e.target.value })} style={shiftField} />
        </div>

        <div>
          <label style={shiftLabel} htmlFor="shift-type">Turi</label>
          <select id="shift-type" value={form.type}
            onChange={(e) => set({ type: e.target.value })} style={shiftField}>
            <option value="work">Ish</option>
            <option value="sick">Kasallik varaqasi (Bolnichniy)</option>
            <option value="vacation">Ta&apos;til (Otpusk)</option>
          </select>
        </div>

        <div>
          <label style={shiftLabel} htmlFor="shift-note">Izoh</label>
          <input id="shift-note" type="text" placeholder="Qo'shimcha izoh…" value={form.note}
            onChange={(e) => set({ note: e.target.value })} style={shiftField} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <button onClick={onSave} className="btn btn-primary btn-sm">Saqlash</button>
        <button onClick={onCancel} className="btn btn-ghost btn-sm">Bekor qilish</button>
      </div>
    </div>
  );
}

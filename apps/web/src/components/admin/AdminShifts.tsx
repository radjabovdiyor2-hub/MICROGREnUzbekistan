'use client';

import { useState } from 'react';
import { Calendar, Clock, Plus } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminShiftForm } from './AdminShiftForm';
import { AdminShiftCard } from './AdminShiftCard';
import { useFeedback } from './AdminFeedback';
import { EMPTY_SHIFT_FORM, type Employee, type Shift, type ShiftForm } from './shiftTypes';

// График смен. Форма и карточка вынесены в соседние файлы: раньше всё жило
// здесь и файл дорос до 297 строк при лимите 200.

/** «14:30» из ISO-строки — для подстановки в <input type="time">. */
function toTimeInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function AdminShifts({ lang = 'ru' }: { lang?: 'ru' | 'uz' }) {
  // Экран был одноязычным, при том что соседние разделы админки написаны
  // по-русски, а кнопка переключения языка в сайдбаре есть.
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const notify = useFeedback();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ShiftForm>(EMPTY_SHIFT_FORM);

  const { data: shifts = [], isLoading: loading } = useQuery<Shift[]>({
    queryKey: ['admin-shifts'],
    queryFn: async () => {
      const res = await fetch('/api/admin/shifts');
      const data = await res.json();
      return data.shifts || [];
    },
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['admin-employees-list'],
    queryFn: async () => {
      const res = await fetch('/api/inventory/employees');
      const data = await res.json();
      return data.employees || [];
    },
  });

  const reload = () => queryClient.invalidateQueries({ queryKey: ['admin-shifts'] });

  const closeForm = () => {
    setShowAdd(false);
    setEditId(null);
    setForm(EMPTY_SHIFT_FORM);
  };

  const handleSave = async () => {
    if (!form.employeeId || !form.date) {
      return notify.toast(t('Укажите сотрудника и дату', 'Xodim va sanani kiriting'), 'warning');
    }

    try {
      const payload: Record<string, unknown> = {
        employeeId: form.employeeId,
        date: form.date,
        type: form.type,
        note: form.note,
      };
      if (editId) payload.id = editId;
      if (form.startTime) payload.startTime = new Date(`${form.date}T${form.startTime}:00`).toISOString();
      if (form.endTime) payload.endTime = new Date(`${form.date}T${form.endTime}:00`).toISOString();

      const res = await fetch('/api/admin/shifts', {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        closeForm();
        reload();
        notify.success(editId ? 'Smena yangilandi' : "Smena qo'shildi");
      } else {
        notify.error(data.error || 'Smena saqlanmadi');
      }
    } catch (err) {
      console.error(err);
      notify.error(t('Нет связи — смена не сохранена', "Aloqa yo'q — smena saqlanmadi"));
    }
  };

  const handleDelete = async (shift: Shift) => {
    const ok = await notify.confirm({
      // Вопрос называет смену: в графике их десятки, и безымянное
      // «O'chirishni tasdiqlaysizmi?» не говорит, какую именно уберут.
      title: lang === 'ru'
        ? `Удалить смену: ${shift.employee?.name ?? '—'} — ${shift.date?.slice(0, 10) ?? ''}?`
        : `${shift.employee?.name ?? 'Smena'} — ${shift.date?.slice(0, 10) ?? ''} o'chirilsinmi?`,
      detail: t('Смена исчезнет из графика.', "Smena jadvaldan yo'qoladi."),
      confirmText: t('Удалить', "O'chirish"),
      danger: true,
    });
    if (!ok) return;

    // Отложенно: пока идёт отсчёт, запрос не уходит — смену можно вернуть
    // одним нажатием, а не заводить заново по памяти.
    notify.undoable({
      text: t('Удаляю смену…', "Smena o'chirilmoqda…"),
      undoneText: t('Отменено — смена на месте', 'Bekor qilindi'),
      run: async () => {
        const res = await fetch(`/api/admin/shifts?id=${shift.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          notify.error(body?.error || "O'chirib bo'lmadi");
          return;
        }
        reload();
      },
    });
  };

  const startEdit = (shift: Shift) => {
    setEditId(shift.id);
    setForm({
      employeeId: shift.employeeId,
      date: new Date(shift.date).toISOString().split('T')[0],
      startTime: toTimeInput(shift.startTime),
      endTime: toTimeInput(shift.endTime),
      type: shift.type,
      note: shift.note || '',
    });
    setShowAdd(true);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={24} /> {t('График смен', 'Grafika (Smenalar)')}
        </h2>
        <button
          onClick={() => {
            if (showAdd) return closeForm();
            setEditId(null);
            setForm({ ...EMPTY_SHIFT_FORM, date: new Date().toISOString().split('T')[0] });
            setShowAdd(true);
          }}
          className="btn btn-primary btn-sm"
          style={{ display: 'flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap' }}
        >
          <Plus size={16} /> {t('Добавить смену', "Smena qo'shish")}
        </button>
      </div>

      {showAdd && (
        <AdminShiftForm
          employees={employees}
          form={form}
          setForm={setForm}
          editId={editId}
          onSave={handleSave}
          onCancel={closeForm}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
            <Clock size={32} style={{ animation: 'pulse 1.5s infinite' }} />
          </div>
        ) : shifts.length === 0 ? (
          <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
            {t('Смен не найдено', 'Smenalar topilmadi')}
          </div>
        ) : (
          shifts.map((shift) => (
            <AdminShiftCard key={shift.id} shift={shift} onEdit={startEdit} onDelete={handleDelete} />
          ))
        )}
      </div>
    </div>
  );
}

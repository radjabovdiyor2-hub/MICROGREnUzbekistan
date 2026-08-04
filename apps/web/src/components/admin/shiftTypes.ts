// Типы и справочник смен. Вынесено из AdminShifts.tsx: файл дорос до 297
// строк при лимите 200, и форма с карточкой жили внутри списка.

export interface Employee {
  id: string;
  name: string;
  department: string | null;
}

export interface Shift {
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

export interface ShiftForm {
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  type: string;
  note: string;
}

export const EMPTY_SHIFT_FORM: ShiftForm = {
  employeeId: '', date: '', startTime: '', endTime: '', type: 'work', note: '',
};

/** Вид смены → подпись и цвет из токенов. Хардкод цветов запрещён. */
export const SHIFT_TYPES: Record<string, { label: string; color: string; bg: string }> = {
  work: { label: 'Ish', color: 'var(--info)', bg: 'var(--info-bg)' },
  sick: { label: 'Bolnichniy', color: 'var(--error)', bg: 'var(--error-bg)' },
  vacation: { label: 'Otpusk', color: 'var(--warning)', bg: 'var(--warning-bg)' },
};

export function shiftType(type: string) {
  return SHIFT_TYPES[type] ?? SHIFT_TYPES.work;
}

/** Общий стиль поля формы — один на все шесть полей. */
export const shiftField: React.CSSProperties = {
  width: '100%',
  padding: 'var(--space-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
};

export const shiftLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  marginBottom: 4,
};

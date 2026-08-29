import { DEPT_LABELS } from './adminTasksConfig';

// Отделы и города для карточки сотрудника.
//
// Отделы берём из того же справочника, что и задачи (adminTasksConfig):
// вокабуляр один — иначе сотрудник числился бы в отделе, которому нельзя
// поставить задачу.

export const DEPARTMENTS = Object.entries(DEPT_LABELS).map(([value, label]) => ({
  value,
  label,
}));

// Города присутствия. Значения совпадают с колонкой `city`, у которой
// в базе дефолт 'tashkent'.
export const CITIES = [
  { value: 'samarqand', label: 'Самарканд' },
  { value: 'tashkent', label: 'Ташкент' },
  { value: 'bukhara', label: 'Бухара' },
];

// ══════════════════════════════════════════════════════════════════════
// Должности сотрудника. Это подпись в карточке и в смене, а не права:
// вход по PIN даёт всем одинаковый доступ (касса, клиенты, свой рейс).
// ══════════════════════════════════════════════════════════════════════
export const EMPLOYEE_ROLES = [
  { value: 'seller', label: 'Sotuvchi' },
  { value: 'manager', label: 'Menejer' },
  { value: 'grower', label: 'Agronom' },
];

/** Разрешённые значения — их же проверяет API. */
export const EMPLOYEE_ROLE_VALUES = EMPLOYEE_ROLES.map((r) => r.value);

export function employeeRoleLabel(role: string): string {
  return EMPLOYEE_ROLES.find((r) => r.value === role)?.label ?? role;
}

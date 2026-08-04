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

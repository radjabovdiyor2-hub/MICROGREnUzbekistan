// Цвета статусов и приоритетов задач отдела. Вынесено из AdminDepartment — чистые данные без состояния.

export const STATUS_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  done: { bg: 'rgba(34, 197, 94, 0.15)', fg: 'var(--cat-7)', label: '✓ Done' },
  in_progress: { bg: 'rgba(59, 130, 246, 0.15)', fg: 'var(--info)', label: '⏳ В работе' },
  todo: { bg: 'rgba(156, 163, 175, 0.15)', fg: 'var(--text-muted)', label: '📋 Todo' },
  review: { bg: 'rgba(245, 158, 11, 0.15)', fg: 'var(--warning)', label: '👀 Review' },
};

export const PRIORITY_COLORS: Record<string, string> = {
  high: 'var(--error)',
  critical: 'var(--error)',
  medium: 'var(--warning)',
  low: 'var(--cat-7)',
};

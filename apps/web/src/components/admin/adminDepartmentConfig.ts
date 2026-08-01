// Цвета статусов и приоритетов задач отдела. Вынесено из AdminDepartment — чистые данные без состояния.

export const STATUS_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  done: { bg: 'color-mix(in srgb, var(--cat-7) 15%, transparent)', fg: 'var(--cat-7)', label: '✓ Done' },
  in_progress: { bg: 'color-mix(in srgb, var(--info) 15%, transparent)', fg: 'var(--info)', label: '⏳ В работе' },
  todo: { bg: 'color-mix(in srgb, var(--text-muted) 15%, transparent)', fg: 'var(--text-muted)', label: '📋 Todo' },
  review: { bg: 'color-mix(in srgb, var(--warning) 15%, transparent)', fg: 'var(--warning)', label: '👀 Review' },
};

export const PRIORITY_COLORS: Record<string, string> = {
  high: 'var(--error)',
  critical: 'var(--error)',
  medium: 'var(--warning)',
  low: 'var(--cat-7)',
};

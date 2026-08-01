// Названия отделов и цвета приоритетов. Вынесено из AdminTasks.

export const DEPT_LABELS: Record<string, string> = {
  sales: 'Продажи', support: 'Поддержка', finance: 'Финансы', hr: 'Кадры',
  marketing: 'Маркетинг', analytics: 'Аналитика', content: 'Контент',
  qa: 'QA', rnd: 'R&D', devops: 'DevOps',
  pm: 'PM (Стёпан)', operations: 'Операции (Стёпан)',
  production: 'Производство (Стёпан)', logistics: 'Логистика (Стёпан)',
};

export const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'var(--error)', high: 'var(--warning)',
  medium: 'var(--info)', low: 'var(--text-muted)',
};

'use client';

import { Trash2 } from 'lucide-react';

import { DEPT_LABELS, PRIORITY_COLOR } from './adminTasksConfig';

// ══════════════════════════════════════════════════════════════════════
// Строка задачи. Вынесена из AdminTasks вместе с чекбоксом и удалением:
// доска была только на чтение плюс смена статуса, а убрать задачу было
// нельзя нигде — ни здесь, ни в Telegram. Отменённая задача остаётся в
// таблице навсегда, поэтому мусор (дубли, задачи несуществующим отделам)
// копился и каждое утро возвращался в сводку просрочки.
// ══════════════════════════════════════════════════════════════════════

export interface Task {
  id: number; title: string; department: string | null; assignee: string | null;
  status: string; priority: string; deadline: string | null;
  description: string | null; createdAt: string;
}

interface Props {
  task: Task;
  today: string;
  selected: boolean;
  onToggle: (id: number) => void;
  onStatus: (task: Task, status: string) => void;
  onDelete: (task: Task) => void;
  inputStyle: React.CSSProperties;
  t: (ru: string, uz: string) => string;
}

export function AdminTaskRow({
  task, today, selected, onToggle, onStatus, onDelete, inputStyle, t,
}: Props) {
  const overdue = task.deadline && task.deadline < today && task.status !== 'done';

  return (
    <div className="card" style={{
      padding: 'var(--space-4)', borderRadius: 12,
      borderLeft: `3px solid ${PRIORITY_COLOR[task.priority] ?? 'var(--border)'}`,
      display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap',
    }}>
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(task.id)}
        aria-label={t(`Выбрать задачу №${task.id}`, `№${task.id} vazifani tanlash`)}
        style={{ width: 16, height: 16, accentColor: 'var(--brand-primary)', cursor: 'pointer' }}
      />

      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{task.title}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span>#{task.id}</span>
          <span>{DEPT_LABELS[task.department ?? ''] ?? task.department ?? '—'}</span>
          <span style={{ color: PRIORITY_COLOR[task.priority] }}>{task.priority}</span>
          {task.deadline && (
            <span style={{ color: overdue ? 'var(--error)' : 'var(--text-muted)', fontWeight: overdue ? 700 : 400 }}>
              {overdue ? `⚠ ${t('просрочено', 'muddati o\'tgan')} ` : ''}{task.deadline}
            </span>
          )}
        </div>
      </div>

      <select
        value={task.status}
        onChange={e => onStatus(task, e.target.value)}
        style={{ ...inputStyle, width: 'auto', padding: '6px 10px', fontSize: 'var(--text-xs)' }}>
        <option value="todo">{t('К выполнению', 'Bajarilishi kerak')}</option>
        <option value="in_progress">{t('В работе', 'Jarayonda')}</option>
        <option value="done">{t('Готово', 'Tayyor')}</option>
        <option value="cancelled">{t('Отменено', 'Bekor qilindi')}</option>
      </select>

      <button
        className="btn btn-sm btn-ghost"
        style={{ color: 'var(--error)' }}
        title={t('Удалить задачу', "Vazifani o'chirish")}
        aria-label={t(`Удалить задачу №${task.id}`, `№${task.id} vazifani o'chirish`)}
        onClick={() => onDelete(task)}>
        <Trash2 size={15} />
      </button>
    </div>
  );
}

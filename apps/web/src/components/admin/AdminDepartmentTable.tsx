'use client';

import React from 'react';
import { ClipboardList } from 'lucide-react';
import { STATUS_COLORS, PRIORITY_COLORS } from './adminDepartmentConfig';

export interface Task {
  id: number;
  title: string;
  assignee: string;
  status: string;
  priority: string;
  deadline: string;
  created_at: string;
}

interface Props {
  filteredTasks: Task[];
  filter: string;
  setFilter: (f: string) => void;
  t: (ru: string, uz: string) => string;
}

export function AdminDepartmentTable({ filteredTasks, filter, setFilter, t }: Props) {
  return (
    <div className="card" style={{ padding: 'var(--space-4)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <h3 style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-base)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ClipboardList size={18} /> {t('Задачи отдела', "Bo'lim vazifalari")}
          <span style={{ fontSize: 'var(--text-xs)', background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: 'var(--radius-full)', color: 'var(--text-muted)' }}>
            {filteredTasks.length}
          </span>
        </h3>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {['all', 'todo', 'in_progress', 'done'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                padding: '4px 10px', borderRadius: 'var(--radius-md)', fontSize: '11px', fontWeight: 600,
                border: '1px solid transparent', cursor: 'pointer',
                background: filter === f ? 'var(--brand-primary)' : 'var(--bg-tertiary)',
                color: filter === f ? 'white' : 'var(--text-secondary)',
              }}>
              {f === 'all' ? t('Все', 'Barchasi') : f === 'todo' ? 'Todo' : f === 'in_progress' ? t('В работе', 'Jarayonda') : t('Готово', 'Tayyor')}
            </button>
          ))}
        </div>
      </div>

      {filteredTasks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
          <ClipboardList size={48} />
          <p style={{ marginTop: 'var(--space-2)' }}>{t('Нет задач в этом отделе', "Bu bo'limda vazifalar yo'q")}</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ID</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('Задача', 'Vazifa')}</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('Исполнитель', 'Bajaruvchi')}</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('Статус', 'Holat')}</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('Приоритет', 'Muhimlik')}</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('Дедлайн', 'Muddat')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map(task => {
                const sc = STATUS_COLORS[task.status] || STATUS_COLORS.todo;
                const pc = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium;
                return (
                  <tr key={task.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)', fontSize: '12px' }}>#{task.id}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 500, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{task.assignee}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 'var(--radius-full)', fontSize: '11px', fontWeight: 700, background: sc.bg, color: sc.fg }}>
                        {sc.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, color: pc }}>
                        ● {task.priority}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '12px' }}>
                      {task.deadline || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

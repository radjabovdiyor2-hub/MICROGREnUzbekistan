'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardList, Plus, Send } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════
// Задачи отделам.
//
// Вкладки отделов показывали доску только на чтение: поставить задачу
// боту можно было исключительно из Telegram, написав Стёпану.
//
// Задача не просто пишется в таблицу — она уходит событием в шину, где
// её подхватывает бот отдела. Если офис недоступен, честно говорим, что
// задача сохранена, но исполнитель не уведомлён.
// ══════════════════════════════════════════════════════════════════════

interface Task {
  id: number; title: string; department: string | null; assignee: string | null;
  status: string; priority: string; deadline: string | null;
  description: string | null; createdAt: string;
}

import { DEPT_LABELS, PRIORITY_COLOR } from './adminTasksConfig';

export function AdminTasks({ lang = 'ru' }: { lang?: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('sales');
  const [priority, setPriority] = useState('medium');
  const [deadline, setDeadline] = useState('');
  const [description, setDescription] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('department', filter);
      const res = await fetch(`/api/admin/tasks?${params}`, { credentials: 'same-origin' });
      const data = await res.json();
      if (data.status === 'ok') {
        setTasks(data.tasks);
        setDepartments(data.departments);
      }
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await fetch('/api/admin/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ title, department, priority, deadline: deadline || null, description }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: 'error', text: data.error || t('Не удалось создать', "Yaratib bo'lmadi") });
        return;
      }
      setMsg(
        data.warning
          ? { type: 'warn', text: data.warning }
          : { type: 'ok', text: t('Задача поставлена и отправлена боту отдела', 'Vazifa bo\'lim botiga yuborildi') },
      );
      setTitle(''); setDescription(''); setDeadline('');
      setShowForm(false);
      await load();
    } catch {
      setMsg({ type: 'error', text: t('Ошибка сети', 'Tarmoq xatosi') });
    }
  };

  const setStatus = async (task: Task, status: string) => {
    await fetch('/api/admin/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ id: task.id, status }),
    });
    await load();
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)',
    borderRadius: 10, background: 'var(--bg-primary)', color: 'var(--text-primary)',
    fontSize: 'var(--text-sm)', outline: 'none',
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
          <option value="all">{t('Все отделы', 'Barcha bo\'limlar')}</option>
          {departments.map(d => <option key={d} value={d}>{DEPT_LABELS[d] ?? d}</option>)}
        </select>

        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary"
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16} /> {t('Поставить задачу', 'Vazifa qo\'yish')}
        </button>
      </div>

      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, fontSize: 'var(--text-sm)', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
          background: msg.type === 'ok' ? 'var(--success-bg)' : msg.type === 'warn' ? 'var(--warning-bg)' : 'var(--error-bg)',
          color: msg.type === 'ok' ? 'var(--success)' : msg.type === 'warn' ? 'var(--warning)' : 'var(--error)',
        }}>
          {msg.type === 'ok' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />} {msg.text}
        </div>
      )}

      {showForm && (
        <form onSubmit={create} className="card" style={{ padding: 'var(--space-5)', borderRadius: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 'var(--space-3)' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                {t('Что нужно сделать', 'Nima qilish kerak')}
              </label>
              <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} required />
            </div>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                {t('Отдел', "Bo'lim")}
              </label>
              <select value={department} onChange={e => setDepartment(e.target.value)} style={inputStyle}>
                {departments.map(d => <option key={d} value={d}>{DEPT_LABELS[d] ?? d}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                {t('Приоритет', 'Muhimlik')}
              </label>
              <select value={priority} onChange={e => setPriority(e.target.value)} style={inputStyle}>
                <option value="low">{t('Низкий', 'Past')}</option>
                <option value="medium">{t('Средний', "O'rta")}</option>
                <option value="high">{t('Высокий', 'Yuqori')}</option>
                <option value="urgent">{t('Срочно', 'Shoshilinch')}</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                {t('Срок', 'Muddat')}
              </label>
              <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                {t('Детали', 'Tafsilotlar')}
              </label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
          </div>

          <button type="submit" className="btn btn-primary"
            style={{ marginTop: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Send size={15} /> {t('Отправить боту отдела', "Bo'lim botiga yuborish")}
          </button>
        </form>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-6)' }}>
            {t('Загрузка…', 'Yuklanmoqda…')}
          </div>
        ) : tasks.map(task => {
          const overdue = task.deadline && task.deadline < today && task.status !== 'done';
          return (
            <div key={task.id} className="card" style={{
              padding: 'var(--space-4)', borderRadius: 12,
              borderLeft: `3px solid ${PRIORITY_COLOR[task.priority] ?? 'var(--border)'}`,
              display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{task.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
                onChange={e => setStatus(task, e.target.value)}
                style={{ ...inputStyle, width: 'auto', padding: '6px 10px', fontSize: 'var(--text-xs)' }}>
                <option value="todo">{t('К выполнению', 'Bajarilishi kerak')}</option>
                <option value="in_progress">{t('В работе', 'Jarayonda')}</option>
                <option value="done">{t('Готово', 'Tayyor')}</option>
                <option value="cancelled">{t('Отменено', 'Bekor qilindi')}</option>
              </select>
            </div>
          );
        })}

        {!loading && !tasks.length && (
          <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
            <ClipboardList size={28} style={{ marginBottom: 8 }} />
            <div>{t('Активных задач нет', 'Faol vazifalar yo\'q')}</div>
          </div>
        )}
      </div>
    </div>
  );
}

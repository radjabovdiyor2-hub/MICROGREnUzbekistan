'use client';

import { useState, useEffect } from 'react';
import {
  AlertTriangle, CheckCircle, ClipboardList, Clock, Package, Send,
} from 'lucide-react';

interface Task {
  id: number;
  title: string;
  assignee: string;
  status: string;
  priority: string;
  deadline: string;
  created_at: string;
}

interface DeptStats {
  total: number;
  done: number;
  in_progress: number;
  todo: number;
  overdue: number;
}

interface DeptData {
  id: string;
  name: string;
  bot: string;
  icon: string;
  stats: DeptStats;
  tasks: Task[];
}

interface Props {
  departmentId: string;
  departmentName: string;
  botName: string;
  lang: 'ru' | 'uz';
}

const STATUS_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  done: { bg: 'rgba(34, 197, 94, 0.15)', fg: 'var(--cat-7)', label: '✓ Done' },
  in_progress: { bg: 'rgba(59, 130, 246, 0.15)', fg: 'var(--info)', label: '⏳ В работе' },
  todo: { bg: 'rgba(156, 163, 175, 0.15)', fg: 'var(--text-muted)', label: '📋 Todo' },
  review: { bg: 'rgba(245, 158, 11, 0.15)', fg: 'var(--warning)', label: '👀 Review' },
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'var(--error)',
  critical: '#dc2626',
  medium: 'var(--warning)',
  low: 'var(--cat-7)',
};

export function AdminDepartment({ departmentId, departmentName, botName, lang }: Props) {
  const [data, setData] = useState<DeptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  const t = (ru: string, uz: string) => lang === 'ru' ? ru : uz;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/departments/${departmentId}`);
        const json = await res.json();
        if (json.success && json.department) {
          setData(json.department);
        }
      } catch (err) {
        console.error('Failed to load department:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [departmentId]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
        <div style={{ width: 40, height: 40, border: '3px solid var(--border)', borderTopColor: 'var(--brand-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto var(--space-4)' }} />
        <p>{t('Загрузка данных отдела...', "Bo'lim ma'lumotlari yuklanmoqda...")}</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const stats = data?.stats || { total: 0, done: 0, in_progress: 0, todo: 0, overdue: 0 };
  const tasks = data?.tasks || [];
  const filteredTasks = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);
  const completionRate = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)', fontSize: 'var(--text-xl)', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
            <span style={{ fontSize: '28px' }}>{data?.icon || '📋'}</span>
            {departmentName}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', margin: '4px 0 0' }}>
            Telegram: <strong>@{botName}</strong> • {t('Статус', 'Holat')}: <span style={{ color: 'var(--success)', fontWeight: 700 }}>● Online</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <a href={`https://t.me/${botName}`} target="_blank" rel="noopener noreferrer"
            className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Send size={14} /> {t('Открыть бот', "Botni ochish")}
          </a>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-3)' }}>
        <StatCard label={t('Всего задач', 'Jami vazifalar')} value={stats.total} icon={<ClipboardList size={20} />} color="var(--brand-primary)" />
        <StatCard label={t('Выполнено', 'Bajarilgan')} value={stats.done} icon={<CheckCircle size={20} />} color="var(--success)" />
        <StatCard label={t('В работе', 'Jarayonda')} value={stats.in_progress} icon={<Clock size={20} />} color="var(--info)" />
        <StatCard label={t('Ожидают', 'Kutmoqda')} value={stats.todo} icon={<Package size={20} />} color="var(--text-muted)" />
        <StatCard label={t('Просрочено', "Muddati o'tgan")} value={stats.overdue} icon={<AlertTriangle size={20} />} color="var(--error)" />
      </div>

      {/* Progress Bar */}
      <div className="card" style={{ padding: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', color: 'var(--text-secondary)' }}>
            {t('Прогресс выполнения', 'Bajarilish jarayoni')}
          </span>
          <span style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', color: completionRate >= 70 ? 'var(--success)' : completionRate >= 40 ? 'var(--warning)' : 'var(--error)' }}>
            {completionRate}%
          </span>
        </div>
        <div style={{ width: '100%', height: 10, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
          <div style={{
            width: `${completionRate}%`,
            height: '100%',
            background: completionRate >= 70 ? 'var(--success)' : completionRate >= 40 ? 'var(--warning)' : 'var(--error)',
            borderRadius: 'var(--radius-full)',
            transition: 'width 0.6s ease-out',
          }} />
        </div>
      </div>

      {/* Tasks Table */}
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
    </div>
  );
}


// Reusable stat card subcomponent
function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="card" style={{
      padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
      borderLeft: `3px solid ${color}`, transition: 'transform 0.15s, box-shadow 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
      <div style={{ color, opacity: 0.8 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{value}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
      </div>
    </div>
  );
}

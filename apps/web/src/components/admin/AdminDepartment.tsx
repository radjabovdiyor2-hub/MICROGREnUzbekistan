'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle, ClipboardList, Clock, Package, Send,
} from 'lucide-react';



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
  lang: 'ru' | 'uz';
}

import { AdminDepartmentTable, type Task } from './AdminDepartmentTable';

export function AdminDepartment({ departmentId, departmentName, lang }: Props) {
  const [filter, setFilter] = useState<string>('all');

  const t = (ru: string, uz: string) => lang === 'ru' ? ru : uz;

  const officeDownMessage = lang === 'ru' ? 'ИИ-офис недоступен' : 'AI-ofis mavjud emas';

  // Отдел в ключе кэша: переход между вкладками отделов второй раз рисуется
  // из кэша, а не ходит в ИИ-офис заново через межсервисный хоп.
  const { data = null, isPending: loading, error: queryError } = useQuery<DeptData>({
    queryKey: ['admin-department', departmentId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/departments/${departmentId}`, { credentials: 'same-origin' });
      const json = await res.json().catch(() => ({}));
      // Раньше роут в этом случае присылал выдуманный пустой отдел, и
      // владелец видел «0 просрочено» вместо «офис недоступен».
      if (!res.ok || !json.success || !json.department) {
        throw new Error(json.error || officeDownMessage);
      }
      return json.department as DeptData;
    },
  });
  const error = queryError instanceof Error ? queryError.message : '';

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
        <div style={{ width: 40, height: 40, border: '3px solid var(--border)', borderTopColor: 'var(--brand-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto var(--space-4)' }} />
        <p>{t('Загрузка данных отдела...', "Bo'lim ma'lumotlari yuklanmoqda...")}</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--error)' }}>
        <AlertTriangle size={28} style={{ marginBottom: 8 }} />
        <div style={{ fontWeight: 'var(--font-bold)', marginBottom: 4 }}>
          {t('Данные отдела недоступны', "Bo'lim ma'lumotlari mavjud emas")}
        </div>
        <div style={{ color: 'var(--text-muted)' }}>{error}</div>
      </div>
    );
  }

  const stats = data?.stats || { total: 0, done: 0, in_progress: 0, todo: 0, overdue: 0 };
  const tasks = data?.tasks || [];
  // Пусто — у отдела нет Telegram-интерфейса (QA, R&D, DevOps), и ссылку
  // рисовать нельзя.
  const botUsername = data?.bot || '';
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
            {/* Раньше здесь всегда горело зелёное «● Online» — при том, что
                данных о состоянии бота в этом ответе нет вовсе. Настоящее
                здоровье ботов живёт в /api/admin/bots (пульс из Redis) и
                показано в разделе «Здоровье ботов».

                Юзернейм приходит из реестра ботов ИИ-офиса, а не вписан здесь:
                прежние захардкоженные имена разошлись с реальностью, а для
                QA/R&D/DevOps подставлялся бот руководителя — ссылка обещала
                чат отдела, которого не существует. */}
            {botUsername
              ? <>Telegram: <strong>@{botUsername}</strong></>
              : t('Без Telegram-интерфейса — задачи ставит Стёпан',
                  "Telegram interfeysi yo'q — vazifalarni Stepan qo'yadi")}
          </p>
        </div>
        {botUsername && (
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <a href={`https://t.me/${botUsername}`} target="_blank" rel="noopener noreferrer"
              className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Send size={14} /> {t('Открыть бот', "Botni ochish")}
            </a>
          </div>
        )}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
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
      <AdminDepartmentTable filteredTasks={filteredTasks} filter={filter} setFilter={setFilter} t={t} />
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
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(var(--overlay-dark-rgb), 0.1)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
      <div style={{ color, opacity: 0.8 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{value}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
      </div>
    </div>
  );
}

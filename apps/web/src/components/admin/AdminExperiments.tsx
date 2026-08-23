'use client';

import { useQuery } from '@tanstack/react-query';
import { Lightbulb, Play } from 'lucide-react';

import { useFeedback } from './AdminFeedback';

interface Experiment {
  id: string;
  batchId: string | null;
  title: string;
  hypothesis: string | null;
  result: string | null;
  status: string; // 'ongoing' | 'success' | 'failed'
  createdAt: string;
  batch?: {
    batchNumber: string;
  };
}

export function AdminExperiments() {
  const notify = useFeedback();
  const { data: experiments = [], isPending: loading } = useQuery<Experiment[]>({
    queryKey: ['admin-experiments'],
    queryFn: async () => {
      const res = await fetch('/api/admin/experiments', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Не удалось загрузить опыты');
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const handleRunAiAnalysis = async (id: string) => {
    // Вызов действия бота R&D для анализа эксперимента
    await fetch('/api/admin/bot-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bot: 'rnd_bot',
        action: 'analyze_experiment',
        params: { experimentId: id }
      })
    });
    notify.success('Задача отправлена R&D боту — результат появится позже');
  };

  if (loading) return <div>Загрузка экспериментов...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Lightbulb size={24} /> R&D Эксперименты
        </h2>
        <button className="btn btn-primary btn-sm">Новый эксперимент</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {experiments.length === 0 ? (
          <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
            Нет активных экспериментов
          </div>
        ) : (
          experiments.map(exp => (
            <div key={exp.id} className="card" style={{ padding: 'var(--space-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                <div>
                  <h3 style={{ fontWeight: 'bold', fontSize: '16px' }}>{exp.title}</h3>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    Создан: {new Date(exp.createdAt).toLocaleDateString('ru-RU')}
                    {exp.batch && ` • Партия: ${exp.batch.batchNumber}`}
                  </div>
                </div>
                <div>
                  <span style={{ 
                    padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold',
                    background: exp.status === 'success' ? 'var(--success-bg)' : exp.status === 'failed' ? 'var(--error-bg)' : 'var(--info-bg)',
                    color: exp.status === 'success' ? 'var(--success)' : exp.status === 'failed' ? 'var(--error)' : 'var(--info)'
                  }}>
                    {exp.status === 'success' ? 'Успешно' : exp.status === 'failed' ? 'Провал' : 'В процессе'}
                  </span>
                </div>
              </div>

              {exp.hypothesis && (
                <div style={{ marginBottom: 'var(--space-3)', fontSize: '13px' }}>
                  <strong style={{ color: 'var(--text-secondary)' }}>Гипотеза: </strong>
                  {exp.hypothesis}
                </div>
              )}

              {exp.result && (
                <div style={{ background: 'var(--bg-secondary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', fontSize: '13px', marginBottom: 'var(--space-3)' }}>
                  <strong style={{ color: 'var(--text-secondary)' }}>Результат: </strong>
                  {exp.result}
                </div>
              )}

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)', display: 'flex', justifyContent: 'flex-end' }}>
                <button 
                  className="btn btn-outline btn-sm" 
                  onClick={() => handleRunAiAnalysis(exp.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Play size={14} /> Запросить анализ ИИ
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

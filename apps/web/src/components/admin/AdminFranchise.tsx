'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Network } from 'lucide-react';

import { useFeedback } from './AdminFeedback';

interface FranchiseJournal {
  id: string;
  city: string;
  department: string;
  action: string;
  content: string;
  metrics: Record<string, unknown> | null;
  createdAt: string;
}

export function AdminFranchise() {
  const notify = useFeedback();
  const [cityFilter, setCityFilter] = useState('');

  // Отмена «устаревшего» ответа флагом `active` больше не нужна: гонку между
  // сменами города разруливает сам ключ кэша.
  const { data: entries = [], isPending: loading } = useQuery<FranchiseJournal[]>({
    queryKey: ['admin-franchise', cityFilter],
    queryFn: async () => {
      const url = cityFilter ? `/api/admin/franchise?city=${cityFilter}` : '/api/admin/franchise';
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Не удалось загрузить журнал франшизы');
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Network size={24} /> Сеть и Франшиза
        </h2>
        
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <select 
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-secondary)', outline: 'none' }}
          >
            <option value="">Все города</option>
            <option value="samarkand">Самарканд</option>
            <option value="bukhara">Бухара</option>
            <option value="fergana">Фергана</option>
          </select>
          
          <button 
            className="btn btn-outline btn-sm"
            onClick={async () => {
              if (!cityFilter) {
                notify.toast('Выберите город для анализа', 'warning');
                return;
              }
              // Ответ сервера ЧИТАЕМ. Прежний код его игнорировал и всегда
              // говорил «отправлено» — при том, что `analyze_franchise` нет
              // в белом списке офиса (`ADMIN_BOT_ACTIONS`), а franchise_bot
              // задач вообще не принимает: он планировщик сводок. Кнопка
              // год обещала анализ, которого не было.
              const res = await fetch('/api/admin/bot-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                  bot: 'franchise_bot',
                  action: 'analyze_franchise',
                  params: { city: cityFilter },
                }),
              });
              const data = await res.json().catch(() => null);
              if (res.ok && data?.status !== 'error') {
                notify.success('Задача на анализ отправлена ИИ');
              } else {
                notify.error(data?.error || `Офис не принял задачу (${res.status})`);
              }
            }}
          >
            Анализ ИИ
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {loading ? (
          <div>Загрузка...</div>
        ) : entries.length === 0 ? (
          <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
            Нет записей в журнале франшизы
          </div>
        ) : (
          entries.map(entry => (
            <div key={entry.id} className="card" style={{ padding: 'var(--space-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                <div>
                  <h3 style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Город: <span style={{ textTransform: 'capitalize' }}>{entry.city}</span>
                  </h3>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    Дата: {new Date(entry.createdAt).toLocaleString('ru-RU')} • Отдел: {entry.department}
                  </div>
                </div>
                <div>
                  <span style={{ 
                    padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold',
                    background: 'var(--brand-primary-light)',
                    color: 'var(--brand-primary)'
                  }}>
                    {entry.action}
                  </span>
                </div>
              </div>
              
              <div style={{ fontSize: '14px', lineHeight: '1.5' }}>
                {entry.content}
              </div>

              {entry.metrics && Object.keys(entry.metrics).length > 0 && (
                <div style={{ marginTop: 'var(--space-3)', background: 'var(--bg-secondary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', fontSize: '13px' }}>
                  <strong style={{ display: 'block', marginBottom: '4px' }}>Метрики:</strong>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-muted)' }}>
                    {JSON.stringify(entry.metrics, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

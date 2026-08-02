'use client';

import { useState, useEffect } from 'react';
import { Network } from 'lucide-react';

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
  const [entries, setEntries] = useState<FranchiseJournal[]>([]);
  const [loading, setLoading] = useState(true);
  const [cityFilter, setCityFilter] = useState('');

  useEffect(() => {
    let active = true;
    let url = '/api/admin/franchise';
    if (cityFilter) url += `?city=${cityFilter}`;
    
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (active && Array.isArray(data)) setEntries(data);
      } catch (err) {
        // ignore
      } finally {
        if (active) setLoading(false);
      }
    };
    
    fetchData();
      
    return () => { active = false; };
  }, [cityFilter]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
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
                alert('Выберите город для анализа');
                return;
              }
              await fetch('/api/admin/bot-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  bot: 'franchise_bot',
                  action: 'analyze_franchise',
                  params: { city: cityFilter }
                })
              });
              alert('Задача на анализ отправлена ИИ');
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

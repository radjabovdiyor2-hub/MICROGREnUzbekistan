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

const T = {
  loadFailed: { ru: 'Не удалось загрузить журнал франшизы', uz: "Franshiza jurnalini yuklab bo'lmadi" },
  title: { ru: 'Сеть и Франшиза', uz: 'Tarmoq va franshiza' },
  allCities: { ru: 'Все города', uz: 'Barcha shaharlar' },
  samarkand: { ru: 'Самарканд', uz: 'Samarqand' },
  bukhara: { ru: 'Бухара', uz: 'Buxoro' },
  fergana: { ru: 'Фергана', uz: "Farg'ona" },
  pickCity: { ru: 'Выберите город для анализа', uz: 'Tahlil uchun shaharni tanlang' },
  sent: { ru: 'Задача на анализ отправлена ИИ', uz: 'Tahlil vazifasi AIga yuborildi' },
  office: { ru: 'Офис не принял задачу', uz: 'Ofis vazifani qabul qilmadi' },
  analyze: { ru: 'Анализ ИИ', uz: 'AI tahlili' },
  loading: { ru: 'Загрузка...', uz: 'Yuklanmoqda...' },
  empty: { ru: 'Нет записей в журнале франшизы', uz: "Franshiza jurnalida yozuvlar yo'q" },
};

export function AdminFranchise({ lang }: { lang: 'ru' | 'uz' }) {
  const t = (k: keyof typeof T) => T[k][lang];
  const notify = useFeedback();
  const [cityFilter, setCityFilter] = useState('');

  // Отмена «устаревшего» ответа флагом `active` больше не нужна: гонку между
  // сменами города разруливает сам ключ кэша.
  const { data: entries = [], isPending: loading } = useQuery<FranchiseJournal[]>({
    queryKey: ['admin-franchise', cityFilter],
    queryFn: async () => {
      const url = cityFilter ? `/api/admin/franchise?city=${cityFilter}` : '/api/admin/franchise';
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(t('loadFailed'));
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Network size={24} /> {t('title')}
        </h2>
        
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <select 
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-secondary)', outline: 'none' }}
          >
            <option value="">{t('allCities')}</option>
            <option value="samarkand">{t('samarkand')}</option>
            <option value="bukhara">{t('bukhara')}</option>
            <option value="fergana">{t('fergana')}</option>
          </select>
          
          <button 
            className="btn btn-outline btn-sm"
            onClick={async () => {
              if (!cityFilter) {
                notify.toast(t('pickCity'), 'warning');
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
                notify.success(t('sent'));
              } else {
                notify.error(data?.error || `${t('office')} (${res.status})`);
              }
            }}
          >
            {t('analyze')}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {loading ? (
          <div>{t('loading')}</div>
        ) : entries.length === 0 ? (
          <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
            {t('empty')}
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

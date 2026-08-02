'use client';

import { AdminLearningsHeader } from './AdminLearningsHeader';

import type { BotLearningItem } from './adminLearningsTypes';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Brain, RefreshCw, Search, CheckCircle2, AlertCircle, Bot, Activity } from 'lucide-react';

import { BOT_EMOJIS } from './adminLearningsConfig';

export function AdminLearnings({ lang }: { lang: 'ru' | 'uz' }) {
  const [selectedBot, setSelectedBot] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const { data: learnings = [], isLoading: loading, error, refetch: fetchLearnings } = useQuery<BotLearningItem[], Error>({
    queryKey: ['admin-learnings'],
    queryFn: async () => {
      const res = await fetch('/api/admin/learnings');
      if (!res.ok) throw new Error('Failed to fetch learnings');
      const data = await res.json();
      return data.learnings || [];
    }
  });

  const filteredLearnings = learnings.filter((item) => {
    const matchesBot = selectedBot === 'all' || item.bot === selectedBot;
    const matchesSearch =
      searchQuery === '' ||
      item.observation.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.inference.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.metric.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesBot && matchesSearch;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <AdminLearningsHeader
        lang={lang}
        loading={loading}
        fetchLearnings={fetchLearnings}
      />
      {/* Filter Toolbar */}
      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)', padding: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', flex: 1, minWidth: '300px' }}>
          <button
            onClick={() => setSelectedBot('all')}
            style={{
              padding: '6px 12px', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', whiteSpace: 'nowrap', transition: 'all 0.2s', border: 'none', cursor: 'pointer',
              background: selectedBot === 'all' ? 'var(--brand-primary)' : 'var(--bg-secondary)',
              color: selectedBot === 'all' ? '#fff' : 'var(--text-primary)',
            }}
          >
            {lang === 'ru' ? 'Все боты' : 'Barchasi'} ({learnings.length})
          </button>
          {Object.keys(BOT_EMOJIS).map((botKey) => {
            const count = learnings.filter((l) => l.bot === botKey).length;
            return (
              <button
                key={botKey}
                onClick={() => setSelectedBot(botKey)}
                style={{
                  padding: '6px 12px', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', whiteSpace: 'nowrap', transition: 'all 0.2s', border: 'none', cursor: 'pointer',
                  background: selectedBot === botKey ? 'var(--brand-primary)' : 'var(--bg-secondary)',
                  color: selectedBot === botKey ? '#fff' : 'var(--text-primary)',
                }}
              >
                {BOT_EMOJIS[botKey]} ({count})
              </button>
            );
          })}
        </div>

        <div style={{ position: 'relative', width: '100%', maxWidth: '256px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={lang === 'ru' ? 'Поиск вычислений...' : 'Qidiruv...'}
            style={{
              width: '100%', padding: '6px 16px 6px 36px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', color: 'var(--text-primary)', outline: 'none'
            }}
          />
        </div>
      </div>

      {/* Main Grid */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px', color: 'var(--text-muted)', gap: '12px' }}>
          <RefreshCw size={20} className="animate-spin" style={{ color: 'var(--brand-primary)' }} />
          <span>{lang === 'ru' ? 'Загрузка активных петель обучения...' : 'Ma\'lumotlar yuklanmoqda...'}</span>
        </div>
      ) : error ? (
        <div style={{ padding: '16px', background: 'var(--error-bg)', border: '1px solid var(--error)', color: 'var(--error)', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <AlertCircle size={20} />
          <span>{error.message}</span>
        </div>
      ) : filteredLearnings.length === 0 ? (
        <div className="card" style={{ padding: '48px', textAlign: 'center', borderStyle: 'dashed' }}>
          <Bot size={40} style={{ margin: '0 auto 12px auto', color: 'var(--text-muted)' }} />
          <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)', color: 'var(--text-primary)', marginBottom: '4px' }}>
            {lang === 'ru' ? 'Петли обучения пока не зафиксированы' : 'O\'rganish ma\'lumotlari topilmadi'}
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', margin: 0 }}>
            {lang === 'ru'
              ? 'Боты автоматически записывают замеры и выводы во время выполнения регулярных задач.'
              : 'Botlar o\'z vazifalarini bajarish jarayonida xulosalarni avtomatik saqlaydi.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-6)' }}>
          {filteredLearnings.map((item) => (
            <div
              key={item.id}
              className="card"
              style={{ minWidth: 0, padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', color: 'var(--text-primary)' }}>
                      {BOT_EMOJIS[item.bot] || item.bot}
                    </span>
                  </div>
                  <span style={{ padding: '4px 10px', background: 'var(--brand-primary-light)', color: 'var(--brand-primary)', border: '1px solid rgba(var(--brand-primary-rgb), 0.2)', fontSize: '11px', fontFamily: 'monospace', borderRadius: 'var(--radius-md)' }}>
                    {item.metric}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--info)', fontSize: '11px', fontWeight: 'var(--font-semibold)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                      <Activity size={14} />
                      <span>{lang === 'ru' ? 'Измерение (Observation)' : 'O\'lchov (Observation)'}</span>
                    </div>
                    <p style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)', background: 'var(--bg-secondary)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', margin: 0 }}>
                      {item.observation}
                    </p>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--warning)', fontSize: '11px', fontWeight: 'var(--font-semibold)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                      <Brain size={14} />
                      <span>{lang === 'ru' ? 'Вывод ИИ (LLM Inference)' : 'AI Xulosasi (Inference)'}</span>
                    </div>
                    <p style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)', background: 'var(--bg-secondary)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', margin: 0, lineHeight: 1.5 }}>
                      {item.inference}
                    </p>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--success)', fontSize: '11px', fontWeight: 'var(--font-semibold)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                      <CheckCircle2 size={14} />
                      <span>{lang === 'ru' ? 'Адаптированные параметры (Behavior Adjustments)' : 'Moslashtirilgan parametrlar'}</span>
                    </div>
                    <pre style={{ color: 'var(--success)', fontSize: '11px', fontFamily: 'monospace', background: 'var(--bg-primary)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', overflowX: 'auto', margin: 0 }}>
                      {JSON.stringify(item.adjustment, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border)', textAlign: 'right' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {lang === 'ru' ? 'Применено: ' : 'Qo\'llandi: '}
                  {new Date(item.appliedAt).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

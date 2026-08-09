'use client';

import { AdminLearningsHeader } from './AdminLearningsHeader';

import type { BotLearningItem } from './adminLearningsTypes';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Search, AlertCircle, Bot } from 'lucide-react';

import { AdminLearningCard } from './AdminLearningCard';
import { BOT_EMOJIS } from './adminLearningsConfig';

export function AdminLearnings({ lang }: { lang: 'ru' | 'uz' }) {
  const [selectedBot, setSelectedBot] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const { data: learnings = [], isLoading: loading, error, refetch: fetchLearnings } = useQuery<BotLearningItem[], Error>({
    queryKey: ['admin-learnings'],
    queryFn: async () => {
      const res = await fetch('/api/admin/learnings');
      if (!res.ok) throw new Error('Failed to fetch learnings');
      const data = await res.json();
      return data.learnings || [];
    }
  });

  const deactivate = async (item: BotLearningItem) => {
    setBusyId(item.id);
    try {
      await fetch('/api/admin/learnings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id: item.id, isActive: false }),
      });
      await fetchLearnings();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (item: BotLearningItem) => {
    const question = lang === 'ru'
      ? `Удалить вывод «${item.metric}» для ${item.bot}?`
      : `${item.bot} uchun «${item.metric}» xulosasi o'chirilsinmi?`;
    if (!confirm(question)) return;
    setBusyId(item.id);
    try {
      await fetch(`/api/admin/learnings?id=${item.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      await fetchLearnings();
    } finally {
      setBusyId(null);
    }
  };

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
            <AdminLearningCard
              key={item.id}
              item={item}
              lang={lang}
              busy={busyId === item.id}
              onDeactivate={deactivate}
              onRemove={remove}
            />
          ))}
        </div>
      )}
    </div>
  );
}

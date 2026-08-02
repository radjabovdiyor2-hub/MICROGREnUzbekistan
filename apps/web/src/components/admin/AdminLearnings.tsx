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
    <div className="space-y-6">
      <AdminLearningsHeader
        lang={lang}
        loading={loading}
        fetchLearnings={fetchLearnings}
      />
      {/* Filter Toolbar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-900/60 p-4 border border-slate-800 rounded-xl">
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
          <button
            onClick={() => setSelectedBot('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              selectedBot === 'all'
                ? 'bg-emerald-500 text-white shadow'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {lang === 'ru' ? 'Все боты' : 'Barchasi'} ({learnings.length})
          </button>
          {Object.keys(BOT_EMOJIS).map((botKey) => {
            const count = learnings.filter((l) => l.bot === botKey).length;
            return (
              <button
                key={botKey}
                onClick={() => setSelectedBot(botKey)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  selectedBot === botKey
                    ? 'bg-emerald-500 text-white shadow'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {BOT_EMOJIS[botKey]} ({count})
              </button>
            );
          })}
        </div>

        <div className="relative w-full md:w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={lang === 'ru' ? 'Поиск вычислений...' : 'Qidiruv...'}
            className="w-full pl-9 pr-4 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Main Grid */}
      {loading ? (
        <div className="flex items-center justify-center p-12 text-slate-400 gap-3">
          <RefreshCw size={20} className="animate-spin text-emerald-400" />
          <span>{lang === 'ru' ? 'Загрузка активных петель обучения...' : 'Ma\'lumotlar yuklanmoqda...'}</span>
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-900/30 border border-rose-500/30 text-rose-300 rounded-xl flex items-center gap-3">
          <AlertCircle size={20} />
          <span>{error.message}</span>
        </div>
      ) : filteredLearnings.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/40 border border-slate-800 rounded-2xl">
          <Bot size={40} className="mx-auto text-slate-600 mb-3" />
          <h3 className="text-lg font-semibold text-slate-300">
            {lang === 'ru' ? 'Петли обучения пока не зафиксированы' : 'O\'rganish ma\'lumotlari topilmadi'}
          </h3>
          <p className="text-slate-500 text-sm mt-1">
            {lang === 'ru'
              ? 'Боты автоматически записывают замеры и выводы во время выполнения регулярных задач.'
              : 'Botlar o\'z vazifalarini bajarish jarayonida xulosalarni avtomatik saqlaydi.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredLearnings.map((item) => (
            <div
              key={item.id}
              className="bg-slate-900/70 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-lg transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-white">
                      {BOT_EMOJIS[item.bot] || item.bot}
                    </span>
                  </div>
                  <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-mono rounded-lg">
                    {item.metric}
                  </span>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-1.5 text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">
                      <Activity size={14} className="text-blue-400" />
                      <span>{lang === 'ru' ? 'Измерение (Observation)' : 'O\'lchov (Observation)'}</span>
                    </div>
                    <p className="text-slate-200 text-sm bg-slate-950/60 p-3 rounded-xl border border-slate-800/50">
                      {item.observation}
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-1">
                      <Brain size={14} />
                      <span>{lang === 'ru' ? 'Вывод ИИ (LLM Inference)' : 'AI Xulosasi (Inference)'}</span>
                    </div>
                    <p className="text-amber-200/90 text-sm bg-amber-950/20 p-3 rounded-xl border border-amber-500/20 leading-relaxed">
                      {item.inference}
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-1">
                      <CheckCircle2 size={14} />
                      <span>{lang === 'ru' ? 'Адаптированные параметры (Behavior Adjustments)' : 'Moslashtirilgan parametrlar'}</span>
                    </div>
                    <pre className="text-emerald-300 text-xs font-mono bg-slate-950 p-3 rounded-xl border border-slate-800 overflow-x-auto">
                      {JSON.stringify(item.adjustment, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/60 text-right">
                <span className="text-xs text-slate-500">
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

'use client';

import { Brain, RefreshCw } from 'lucide-react';

// Шапка раздела петель обучения с кнопкой обновления.

interface Props {
  lang: 'ru' | 'uz';
  loading: boolean;
  fetchLearnings: () => void;
}

export function AdminLearningsHeader({ lang, loading, fetchLearnings }: Props) {
  return (
    <>
{/* Header Banner */}
<div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-gradient-to-r from-emerald-900/40 via-teal-900/30 to-blue-900/40 border border-emerald-500/20 rounded-2xl backdrop-blur-xl">
  <div>
    <div className="flex items-center gap-2 text-emerald-400 font-semibold mb-1">
      <Brain size={22} className="animate-pulse" />
      <span>{lang === 'ru' ? 'Замкнутые петли интеллекта ИИ' : 'AI Intellekti Va O\'rgatish Tizimi'}</span>
    </div>
    <h2 className="text-2xl font-bold text-white">
      {lang === 'ru' ? 'Автономное обучение 11 Ботов (Action → Measurement → Inference → Behavior)' : '11 Botlar Avtonom O\'rganishi'}
    </h2>
    <p className="text-slate-400 text-sm mt-1">
      {lang === 'ru'
        ? 'Мониторинг замеров метрик, логических выводов LLM Reasoning и динамических настроек поведения ботов в режиме реального времени.'
        : 'Botlarning real-vaqtdagi tahlillari, LLM reasoned xulosalari va dinamik parametrlarini kuzatish.'}
    </p>
  </div>

  <button
    onClick={fetchLearnings}
    disabled={loading}
    className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl transition-all shadow-lg shadow-emerald-900/30 disabled:opacity-50 self-start md:self-auto"
  >
    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
    <span>{lang === 'ru' ? 'Обновить данные' : 'Yangilash'}</span>
  </button>
</div>
    </>
  );
}

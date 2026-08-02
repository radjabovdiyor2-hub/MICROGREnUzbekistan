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
    <div className="card" style={{ padding: 'var(--space-6)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', justifyContent: 'space-between', alignItems: 'center' }}>
      <div className="min-w-0" style={{ flex: '1 1 300px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--brand-primary)', fontWeight: 'var(--font-semibold)', marginBottom: 4 }}>
          <Brain size={22} className="animate-pulse" />
          <span>{lang === 'ru' ? 'Замкнутые петли интеллекта ИИ' : 'AI Intellekti Va O\'rgatish Tizimi'}</span>
        </div>
        <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--text-primary)', margin: '0 0 var(--space-2) 0', textWrap: 'balance', wordBreak: 'break-word', lineHeight: 1.2 }}>
          {lang === 'ru' ? (
            <>
              Автономное обучение 11 Ботов
              <span style={{ display: 'block', color: 'var(--brand-primary)', fontSize: 'var(--text-sm)', marginTop: 4, fontFamily: 'monospace', letterSpacing: '-0.02em' }}>
                (Action → Measurement → Inference → Behavior)
              </span>
            </>
          ) : (
            '11 Botlar Avtonom O\'rganishi'
          )}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', margin: 0 }}>
          {lang === 'ru'
            ? 'Мониторинг замеров метрик, логических выводов LLM Reasoning и динамических настроек поведения ботов в режиме реального времени.'
            : 'Botlarning real-vaqtdagi tahlillari, LLM reasoned xulosalari va dinamik parametrlarini kuzatish.'}
        </p>
      </div>

      <button
        onClick={fetchLearnings}
        disabled={loading}
        className="btn btn-outline"
        style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }}
      >
        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        <span>{lang === 'ru' ? 'Обновить данные' : 'Yangilash'}</span>
      </button>
    </div>
  );
}

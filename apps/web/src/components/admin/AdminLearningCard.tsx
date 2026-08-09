'use client';

import { Activity, Brain, CheckCircle2, PowerOff, Trash2 } from 'lucide-react';

import { BOT_EMOJIS } from './adminLearningsConfig';
import type { BotLearningItem } from './adminLearningsTypes';

// ══════════════════════════════════════════════════════════════════════
// Карточка одного вывода обучения. Вынесена из AdminLearnings вместе с
// кнопками отключения и удаления.
//
// Роут /api/admin/learnings умеет PATCH и DELETE с самого начала, а его
// комментарий называет это «человеком в контуре» — но интерфейс не вызывал
// их ни разу: на экране была одна кнопка «Обновить». Выводы, сочинённые
// моделью по вчерашней выручке, попадали в промпты ботов, и отменить их
// было нечем. Один из них до недавнего времени печатался покупателям
// на главной витрины.
// ══════════════════════════════════════════════════════════════════════

const LABEL: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
  fontWeight: 'var(--font-semibold)', textTransform: 'uppercase',
  letterSpacing: '0.05em', marginBottom: 4,
};

const BOX: React.CSSProperties = {
  color: 'var(--text-primary)', fontSize: 'var(--text-sm)',
  background: 'var(--bg-secondary)', padding: 12,
  borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', margin: 0,
};

interface Props {
  item: BotLearningItem;
  lang: 'ru' | 'uz';
  busy: boolean;
  onDeactivate: (item: BotLearningItem) => void;
  onRemove: (item: BotLearningItem) => void;
}

export function AdminLearningCard({ item, lang, busy, onDeactivate, onRemove }: Props) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);

  return (
    <div className="card" style={{ minWidth: 0, padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', color: 'var(--text-primary)' }}>
            {BOT_EMOJIS[item.bot] || item.bot}
          </span>
          <span style={{ padding: '4px 10px', background: 'var(--brand-primary-light)', color: 'var(--brand-primary)', border: '1px solid rgba(var(--brand-primary-rgb), 0.2)', fontSize: 11, fontFamily: 'monospace', borderRadius: 'var(--radius-md)' }}>
            {item.metric}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ ...LABEL, color: 'var(--info)' }}>
              <Activity size={14} />
              <span>{t('Измерение (Observation)', "O'lchov (Observation)")}</span>
            </div>
            <p style={BOX}>{item.observation}</p>
          </div>

          <div>
            <div style={{ ...LABEL, color: 'var(--warning)' }}>
              <Brain size={14} />
              <span>{t('Вывод ИИ (LLM Inference)', 'AI Xulosasi (Inference)')}</span>
            </div>
            <p style={{ ...BOX, lineHeight: 1.5 }}>{item.inference}</p>
          </div>

          <div>
            <div style={{ ...LABEL, color: 'var(--success)' }}>
              <CheckCircle2 size={14} />
              <span>{t('Адаптированные параметры', 'Moslashtirilgan parametrlar')}</span>
            </div>
            <pre style={{ color: 'var(--success)', fontSize: 11, fontFamily: 'monospace', background: 'var(--bg-primary)', padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', overflowX: 'auto', margin: 0 }}>
              {JSON.stringify(item.adjustment, null, 2)}
            </pre>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {t('Применено: ', "Qo'llandi: ")}
          {new Date(item.appliedAt).toLocaleString()}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="btn btn-sm btn-ghost"
            disabled={busy}
            onClick={() => onDeactivate(item)}
            title={t('Перестать применять этот вывод', "Bu xulosani qo'llashni to'xtatish")}>
            <PowerOff size={14} /> {t('Отключить', "O'chirish")}
          </button>
          <button
            className="btn btn-sm btn-ghost"
            style={{ color: 'var(--error)' }}
            disabled={busy}
            onClick={() => onRemove(item)}
            title={t('Удалить вывод', "Xulosani o'chirish")}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

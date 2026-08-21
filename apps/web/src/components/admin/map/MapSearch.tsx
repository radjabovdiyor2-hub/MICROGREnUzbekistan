'use client';

import { Search, X } from 'lucide-react';

import { companyTypeLabel } from '@/lib/customers/companyTypes';
import { districtLabel } from '@/lib/customers/districts';
import type { SegmentState } from '@/lib/customers/segments';

import { type PointView } from './mapFeature';

// ══════════════════════════════════════════════════════════════════════
// Поиск по карте и быстрые ответы на вопрос дня.
//
// Найти конкретное заведение среди тысячи точек можно было только
// фильтрами — то есть сузив карту до района и разглядывая её глазами.
// Поиск ищет среди уже загруженных точек и подлетает к найденной.
//
// Рядом — три кнопки на самые частые вопросы. «Кому пора» собиралось
// тремя кликами по легенде, хотя это первое, что спрашивают утром.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  lang: 'ru' | 'uz';
  query: string;
  onQuery: (value: string) => void;
  matches: PointView[];
  onPick: (point: PointView) => void;
  states: Set<SegmentState> | null;
  onStates: (states: Set<SegmentState> | null) => void;
}

const text = {
  placeholder: { ru: 'Найти заведение…', uz: 'Muassasa topish…' },
  nothing: { ru: 'Ничего не нашлось', uz: 'Hech narsa topilmadi' },
  clear: { ru: 'Очистить', uz: 'Tozalash' },
};

/**
 * Быстрые наборы состояний. `null` — фильтра нет.
 *
 * «Кому пора» — это slipping и at_risk вместе: разделять их в кнопке
 * незачем, ехать надо и к тем, и к другим, разница лишь в том, насколько
 * поздно.
 */
const QUICK: { id: string; ru: string; uz: string; states: SegmentState[] | null }[] = [
  { id: 'all', ru: 'Все', uz: 'Barchasi', states: null },
  { id: 'due', ru: 'Кому пора', uz: 'Vaqti kelganlar', states: ['slipping', 'at_risk'] },
  { id: 'new', ru: 'Новые', uz: 'Yangilar', states: ['new'] },
  { id: 'lost', ru: 'Потерянные', uz: 'Yoʻqotilganlar', states: ['lost'] },
];

/** Какой набор сейчас включён — чтобы кнопка была нажатой, а не просто цветной. */
function activeQuick(states: Set<SegmentState> | null): string {
  if (!states) return 'all';
  for (const q of QUICK) {
    if (!q.states) continue;
    if (q.states.length === states.size && q.states.every((s) => states.has(s))) return q.id;
  }
  return '';
}

const chipStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 14px',
  minHeight: 36,
  borderRadius: 'var(--radius-full)',
  border: `1px solid ${active ? 'var(--brand-primary)' : 'var(--border)'}`,
  background: active ? 'var(--brand-primary)' : 'transparent',
  color: active ? 'var(--text-inverse)' : 'var(--text-secondary)',
  fontSize: 'var(--text-xs)',
  cursor: 'pointer',
});

export function MapSearch({ lang, query, onQuery, matches, onPick, states, onStates }: Props) {
  const current = activeQuick(states);
  const searching = query.trim().length >= 2;

  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)', position: 'relative' }}>
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <Search
            size={16}
            aria-hidden
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            className="input"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={text.placeholder[lang]}
            aria-label={text.placeholder[lang]}
            style={{ width: '100%', minHeight: 40, paddingLeft: 34 }}
          />
          {query && (
            <button
              type="button"
              onClick={() => onQuery('')}
              aria-label={text.clear[lang]}
              className="btn btn-sm btn-ghost"
              style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)' }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {QUICK.map((q) => (
          <button
            key={q.id}
            type="button"
            style={chipStyle(current === q.id)}
            onClick={() => onStates(q.states ? new Set(q.states) : null)}
          >
            {q[lang]}
          </button>
        ))}
      </div>

      {searching && (
        <div
          className="card"
          style={{
            position: 'absolute',
            top: 46,
            left: 0,
            right: 0,
            zIndex: 30,
            padding: 'var(--space-1)',
            maxHeight: 280,
            overflowY: 'auto',
          }}
        >
          {matches.length === 0 ? (
            <div
              style={{
                padding: 'var(--space-2)',
                fontSize: 'var(--text-sm)',
                color: 'var(--text-muted)',
              }}
            >
              {text.nothing[lang]}
            </div>
          ) : (
            matches.map((m) => (
              <button
                key={m.id}
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => onPick(m)}
                style={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  minHeight: 44,
                  display: 'block',
                }}
              >
                <div style={{ fontWeight: 'var(--font-medium)' }}>{m.name}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  {companyTypeLabel(m.companyType, lang)}
                  {m.district && ` · ${districtLabel(m.district, lang)}`}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

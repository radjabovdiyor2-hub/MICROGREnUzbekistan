'use client';

import { SEGMENT_META, SEGMENT_STATES, type SegmentState } from '@/lib/customers/segments';

import { formatSum, type MapCollection } from './mapFeature';

// ══════════════════════════════════════════════════════════════════════
// Легенда: состояние → цвет → сколько клиентов → сколько денег.
//
// Деньги здесь не для красоты. «12 клиентов под угрозой» — это тревога
// без масштаба; «12 клиентов под угрозой на 84 млн сум» говорит, чем
// именно рискуем, и сразу расставляет приоритеты. Клик по строке
// оставляет на карте только это состояние.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  summary: MapCollection['summary'];
  lang: 'ru' | 'uz';
  active: Set<SegmentState> | null;
  onToggle: (state: SegmentState) => void;
}

export function CustomerMapLegend({ summary, lang, active, onToggle }: Props) {
  const visible = SEGMENT_STATES.filter((s) => summary.byState[s] > 0).sort(
    (a, b) => SEGMENT_META[a].order - SEGMENT_META[b].order,
  );

  if (visible.length === 0) return null;

  return (
    <div
      className="card"
      style={{ padding: 'var(--space-3)', display: 'grid', gap: 'var(--space-1)' }}
    >
      {visible.map((state) => {
        const meta = SEGMENT_META[state];
        const isActive = active === null || active.has(state);
        return (
          <button
            key={state}
            type="button"
            onClick={() => onToggle(state)}
            aria-pressed={active !== null && active.has(state)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: 'var(--space-1) var(--space-2)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
              // Отключённое состояние гасим прозрачностью, а не серым цветом:
              // серый — это уже занятый цвет «Потенциального».
              opacity: isActive ? 1 : 0.35,
              transition: 'opacity var(--transition-fast)',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 12,
                height: 12,
                borderRadius: 'var(--radius-full)',
                background: meta.token,
                flexShrink: 0,
              }}
            />
            <span style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
              {meta[lang]}
            </span>
            <span
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--font-semibold)',
                color: 'var(--text-primary)',
              }}
            >
              {summary.byState[state]}
            </span>
            <span
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)',
                minWidth: 72,
                textAlign: 'right',
              }}
            >
              {formatSum(summary.revenueByState[state])}
            </span>
          </button>
        );
      })}
    </div>
  );
}

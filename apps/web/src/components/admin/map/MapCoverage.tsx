'use client';

import { COVERAGE_META, coverageAdvice, type Coverage } from '@/lib/customers/coverage';

// ══════════════════════════════════════════════════════════════════════
// Насколько карта готова к поездке.
//
// «На карте 812 из 947» отвечает на вопрос «сколько точек нарисовано», но
// не на тот, который задают на самом деле: по скольким можно поехать.
// Точка с точностью «район» стоит в центре тумана и выглядит ровно так же
// уверенно, как точка у дверей ресторана.
//
// Полоса, а не таблица: доля читается взглядом, а разбор цифрами — под ней.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  coverage: Coverage;
  lang: 'ru' | 'uz';
}

const title = { ru: 'Готовность карты', uz: 'Xarita tayyorligi' };

export function MapCoverage({ coverage, lang }: Props) {
  if (coverage.total === 0) return null;

  const parts: { grade: keyof typeof COVERAGE_META; value: number }[] = [
    { grade: 'exact', value: coverage.exact },
    { grade: 'rough', value: coverage.rough },
    { grade: 'missing', value: coverage.missing },
  ];

  return (
    <div className="card" style={{ padding: 'var(--space-3)', display: 'grid', gap: 'var(--space-2)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontWeight: 'var(--font-semibold)', flex: 1 }}>{title[lang]}</span>
        <span style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }}>
          {coverage.percent}%
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          height: 8,
          borderRadius: 'var(--radius-full)',
          overflow: 'hidden',
          background: 'var(--bg-tertiary)',
        }}
      >
        {parts.map(
          ({ grade, value }) =>
            value > 0 && (
              <div
                key={grade}
                title={`${COVERAGE_META[grade][lang]}: ${value}`}
                style={{
                  width: `${(value / coverage.total) * 100}%`,
                  background: COVERAGE_META[grade].token,
                }}
              />
            ),
        )}
      </div>

      <div style={{ display: 'grid', gap: 2 }}>
        {parts.map(({ grade, value }) => (
          <div
            key={grade}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: COVERAGE_META[grade].token,
              }}
            />
            <span style={{ flex: 1 }}>{COVERAGE_META[grade][lang]}</span>
            <span>{value}</span>
          </div>
        ))}
      </div>

      {/* Проценты без следующего шага превращаются в укор: человек видит
          71 % и не знает, чем это лечить. */}
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        {coverageAdvice(coverage, lang)}
      </div>
    </div>
  );
}

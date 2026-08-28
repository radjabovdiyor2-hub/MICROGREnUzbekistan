'use client';

import React from 'react';
import { ArrowDownUp } from 'lucide-react';
import type { CashFlow } from '@/lib/finance/cashFlow';

const money = (n: number) => `${Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ')} сум`;

interface Props {
  flow: CashFlow;
  t: (ru: string, uz: string) => string;
}

/**
 * Движение денег по дням.
 *
 * Накопленная величина подписана «изменение», а не «остаток», и это не
 * придирка к слову: входящего сальдо система не знает, и число, названное
 * остатком, не сойдётся с банком.
 */
export function AdminCashFlow({ flow, t }: Props) {
  if (flow.days.length === 0) return null;

  return (
    <div className="card" style={{ padding: 'var(--space-4)', borderRadius: 14 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 'var(--space-3)',
          color: 'var(--brand-primary)',
        }}
      >
        <ArrowDownUp size={18} />
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700 }}>
          {t('Движение денег', 'Pul harakati')}
        </span>
      </div>

      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 8 }}>
        {t('Пришло', 'Kirim')} {money(flow.inflow)} · {t('ушло', 'chiqim')} {money(flow.outflow)}
      </div>

      {flow.worstChange < 0 && (
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--warning)', marginBottom: 8 }}>
          {t(
            `Самая глубокая просадка за период — ${money(-flow.worstChange)}.`,
            `Davrdagi eng chuqur pasayish — ${money(-flow.worstChange)}.`,
          )}
        </div>
      )}

      <div style={{ display: 'grid', gap: 4 }}>
        {flow.days.map((day) => (
          <div
            key={day.date}
            style={{
              display: 'grid',
              gridTemplateColumns: '92px 1fr auto',
              gap: 'var(--space-3)',
              alignItems: 'center',
              fontSize: 'var(--text-xs)',
            }}
          >
            <span style={{ color: 'var(--text-muted)' }}>{day.date}</span>
            <span style={{ color: day.net < 0 ? 'var(--error)' : 'var(--success)' }}>
              {day.net >= 0 ? '+' : ''}
              {money(day.net)}
            </span>
            <span
              style={{
                fontWeight: 600,
                whiteSpace: 'nowrap',
                color: day.change < 0 ? 'var(--error)' : 'var(--text-primary)',
              }}
            >
              {money(day.change)}
            </span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.45 }}>
        {t(
          'Правая колонка — изменение с начала периода, а не остаток на счету: сколько денег было на старте, система не знает.',
          "O'ng ustun — davr boshidan o'zgarish, hisobdagi qoldiq emas.",
        )}
      </div>
    </div>
  );
}

'use client';

import { categoryLabel } from '@/lib/finance/categories';

import React from 'react';
import { TrendingDown, TrendingUp, Wallet } from 'lucide-react';

interface Summary { income: number; expense: number; profit: number; margin: number }

const money = (n: number) => `${Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ')} сум`;

interface Props {
  summary: Summary;
  byCategory: Array<{ type: string; category: string; total: number }>;
  t: (ru: string, uz: string) => string;
}

export function AdminFinanceSummary({ summary, byCategory, t }: Props) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-3)' }}>
        {[
          { label: t('Доход', 'Daromad'), value: summary.income, color: 'var(--success)', icon: <TrendingUp size={18} /> },
          { label: t('Расход', 'Xarajat'), value: summary.expense, color: 'var(--error)', icon: <TrendingDown size={18} /> },
          {
            label: t('Прибыль', 'Foyda'), value: summary.profit,
            color: summary.profit >= 0 ? 'var(--brand-primary)' : 'var(--error)',
            icon: <Wallet size={18} />, extra: `${summary.margin}%`,
          },
        ].map(card => (
          <div key={card.label} className="card" style={{ padding: 'var(--space-4)', borderRadius: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: card.color, marginBottom: 6 }}>
              {card.icon}
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                {card.label}
              </span>
            </div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: card.color }}>
              {money(card.value)}
            </div>
            {card.extra && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {t('маржа', 'marja')}: {card.extra}
              </div>
            )}
          </div>
        ))}
      </div>

      {byCategory.length > 0 && (
        <div className="card" style={{ padding: 'var(--space-4)', borderRadius: 14 }}>
          <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginBottom: 'var(--space-3)' }}>
            {t('По статьям', "Moddalar bo'yicha")}
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {byCategory.slice(0, 12).map(c => (
              <div key={`${c.type}:${c.category}`}
                style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {categoryLabel(c.category)}
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 6 }}>
                    {c.type === 'income' ? t('доход', 'daromad') : t('расход', 'xarajat')}
                  </span>
                </span>
                <b style={{ color: c.type === 'income' ? 'var(--success)' : 'var(--error)' }}>
                  {money(c.total)}
                </b>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

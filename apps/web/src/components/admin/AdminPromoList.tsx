'use client';

import React from 'react';
import { Percent, Tag, ToggleLeft, ToggleRight } from 'lucide-react';
import type { Promo } from './adminPromoTypes';

const money = (n: number) => `${n.toLocaleString('ru-RU').replace(/,/g, ' ')} сум`;

interface Props {
  codes: Promo[];
  loading: boolean;
  t: (ru: string, uz: string) => string;
  toggle: (promo: Promo) => void;
}

export function AdminPromoList({ codes, loading, t, toggle }: Props) {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-6)' }}>
        {t('Загрузка…', 'Yuklanmoqda…')}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {codes.map((p) => {
        const dead = !p.isActive || p.exhausted || p.expired;
        const reason = !p.isActive
          ? t('выключен', "o'chirilgan")
          : p.expired
          ? t('истёк', 'muddati tugagan')
          : p.exhausted
          ? t('лимит исчерпан', 'limit tugagan')
          : '';

        return (
          <div
            key={p.id}
            className="card"
            style={{
              padding: 'var(--space-4)',
              borderRadius: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-4)',
              flexWrap: 'wrap',
              opacity: dead ? 0.6 : 1,
              borderLeft: `3px solid ${dead ? 'var(--text-muted)' : 'var(--success)'}`,
            }}
          >
            <div style={{ minWidth: 130 }}>
              <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 'var(--text-base)' }}>
                {p.code}
              </div>
              {reason && (
                <div style={{ fontSize: '11px', color: 'var(--warning)' }}>{reason}</div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--brand-primary)' }}>
              {p.discountType === 'percent' ? <Percent size={15} /> : <Tag size={15} />}
              {p.discountType === 'percent' ? `${p.value}%` : money(p.value)}
            </div>

            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', flex: 1, minWidth: 160 }}>
              {p.minSubtotal > 0 && <div>{t('от', 'dan')} {money(p.minSubtotal)}</div>}
              <div>
                {t('использован', 'ishlatilgan')}: {p.usedCount}
                {p.maxUses != null ? ` / ${p.maxUses}` : ''}
              </div>
              {p.expiresAt && (
                <div>{t('до', 'gacha')} {new Date(p.expiresAt).toLocaleDateString('ru-RU')}</div>
              )}
            </div>

            <button
              onClick={() => toggle(p)}
              title={p.isActive ? t('Выключить', "O'chirish") : t('Включить', 'Yoqish')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: p.isActive ? 'var(--success)' : 'var(--text-muted)',
              }}
            >
              {p.isActive ? <ToggleRight size={26} /> : <ToggleLeft size={26} />}
            </button>
          </div>
        );
      })}

      {!codes.length && (
        <div className="card" style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Tag size={28} style={{ marginBottom: 8 }} />
          <div>{t('Промокодов пока нет', "Hozircha promokodlar yo'q")}</div>
        </div>
      )}
    </div>
  );
}

'use client';

import React from 'react';
import { Flame, Sunrise } from 'lucide-react';
import type { Rhythm } from '@/lib/owner/practices';

interface View {
  rhythm: Rhythm;
  status: string;
  progress: { streak: number; due: boolean };
}

/**
 * Шапка экрана владельца: что сегодня и как держится.
 *
 * Показывает ДВА числа, а не десять. «Сегодня осталось» — это то, ради
 * чего экран открыли; «дней подряд» — то, ради чего его откроют завтра.
 * Остальное считается ниже, по областям.
 */
export function AdminOwnerSummary({ practices, lang }: { practices: View[]; lang: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'uz' ? uz : ru);

  const active = practices.filter((p) => p.status !== 'paused' && p.rhythm !== 'principle');
  const due = active.filter((p) => p.progress.due).length;
  const best = active.reduce((max, p) => Math.max(max, p.progress.streak), 0);

  return (
    <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
      <div className="card" style={{ flex: 1, padding: 'var(--space-3)', borderRadius: 12 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
          }}
        >
          <Sunrise size={13} /> {t('Не сделано', 'Bajarilmagan')}
        </div>
        <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginTop: 2 }}>
          {due === 0 ? t('всё', 'hammasi') : due}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.4 }}>
          {due === 0
            ? t('на сегодня закрыто', 'bugunga yopilgan')
            : t(`из ${active.length} по ритму`, `${active.length} tadan`)}
        </div>
      </div>

      <div className="card" style={{ flex: 1, padding: 'var(--space-3)', borderRadius: 12 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
          }}
        >
          <Flame size={13} /> {t('Лучшая серия', 'Eng yaxshi seriya')}
        </div>
        <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginTop: 2 }}>{best}</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.4 }}>
          {t('периодов подряд', 'ketma-ket davr')}
        </div>
      </div>
    </div>
  );
}

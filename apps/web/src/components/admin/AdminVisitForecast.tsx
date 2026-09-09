'use client';

import React from 'react';
import { Route } from 'lucide-react';

import type { VisitForecast } from '@/lib/finance/expectedVisits';

const money = (n: number) => `${Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ')} сум`;

const WEEKDAY_RU = ['', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const WEEKDAY_UZ = ['', 'du', 'se', 'ch', 'pa', 'ju', 'sh', 'ya'];

interface Props {
  forecast: VisitForecast;
  t: (ru: string, uz: string) => string;
}

/**
 * Ожидаемые поступления по объездам.
 *
 * ПОЧЕМУ ОТДЕЛЬНЫМ БЛОКОМ, А НЕ СТРОКОЙ В ПЛАТЁЖНОМ КАЛЕНДАРЕ. Календарь
 * показывает обязательства: долг можно требовать. Здесь — ожидание,
 * которое не сбудется, если заведение сегодня закрыто или взяло меньше
 * обычного. Поставить их рядом в одну сумму значит показать кассу лучше,
 * чем она есть, ровно там, где по ней принимают решение.
 *
 * Поэтому и заголовок говорит «ожидается», и внизу прямо сказано, что это
 * средний чек, а не обещание.
 */
export function AdminVisitForecast({ forecast, t }: Props) {
  const { days, total, unknown } = forecast;

  if (days.length === 0) return null;

  return (
    <div
      className="card"
      style={{ padding: 'var(--space-4)', borderRadius: 14, borderLeft: '3px solid var(--brand-primary)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        <Route size={18} />
        <div style={{ fontWeight: 'var(--font-bold)' }}>
          {t('Ожидается по объездам', 'Yo‘nalishlardan kutilmoqda')}
        </div>
        <div style={{ marginLeft: 'auto', fontWeight: 'var(--font-bold)' }}>{money(total)}</div>
      </div>

      <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
        {days.map((d) => (
          <div key={d.date} style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-2)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'baseline' }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-bold)' }}>
                {d.date} · {t(WEEKDAY_RU[d.weekday], WEEKDAY_UZ[d.weekday])}
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 'var(--text-sm)' }}>{money(d.expected)}</div>
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              {d.visits
                .map((v) => (v.expected > 0 ? v.customerName : `${v.customerName} (?)`))
                .join(' · ')}
            </div>
          </div>
        ))}
      </div>

      {unknown.length > 0 && (
        <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {t('Без прогноза', 'Bashoratsiz')}: {unknown.map((u) => u.customerName).join(', ')} —{' '}
          {t(
            'заезд состоится, но истории заказов не хватает, чтобы назвать сумму',
            'tashrif bo‘ladi, lekin summani aytishga buyurtma tarixi yetarli emas',
          )}
        </div>
      )}

      <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        {t(
          'Это прогноз по среднему чеку, а не долг: в сальдо платёжного календаря он не входит.',
          'Bu o‘rtacha chek bo‘yicha bashorat, qarz emas: to‘lov kalendari saldosiga kirmaydi.',
        )}
      </div>
    </div>
  );
}

'use client';

import React from 'react';
import { CalendarClock } from 'lucide-react';
import type { PaymentCalendar } from '@/lib/finance/paymentCalendar';

const money = (n: number) => `${Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ')} сум`;

interface Props {
  calendar: PaymentCalendar;
  t: (ru: string, uz: string) => string;
}

/**
 * Платёжный календарь: когда приходит и когда уходит.
 *
 * Худшее сальдо вынесено наверх отдельно — оно и есть ответ на вопрос
 * «хватит ли денег». Итог периода его не заменяет: месяц может закрыться в
 * плюс, пройдя через провал двадцатого числа.
 */
export function AdminPaymentCalendar({ calendar, t }: Props) {
  const { days, undated, worstBalance, overdueIncoming, overdueOutgoing, criticalOutgoing } =
    calendar;

  if (days.length === 0 && undated.length === 0) {
    return null;
  }

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
        <CalendarClock size={18} />
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700 }}>
          {t('Платёжный календарь', "To'lov taqvimi")}
        </span>
      </div>

      {worstBalance < 0 && (
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--error)', marginBottom: 8 }}>
          {t(
            `Разрыв: в худший день не хватит ${money(-worstBalance)}.`,
            `Uzilish: eng yomon kunda ${money(-worstBalance)} yetishmaydi.`,
          )}
        </div>
      )}

      {/* Очередь важнее суммы. Заплатить всем сразу в разрыв не выйдет, и
          решение принимается не по общему долгу, а по этой части: семена
          и субстрат двигать нельзя — посев не наверстать, цикл занимает
          недели, и потерянная неделя это пустые полки через месяц. */}
      {criticalOutgoing > 0 && (
        <div style={{ fontSize: 'var(--text-xs)', marginBottom: 8, lineHeight: 1.45 }}>
          {t(
            `Двигать нельзя: ${money(criticalOutgoing)} — семена и субстрат. Задержка здесь останавливает посев, остальное можно передоговорить.`,
            `Surib bo'lmaydi: ${money(criticalOutgoing)} — urug' va substrat. Bu yerdagi kechikish ekishni to'xtatadi.`,
          )}
        </div>
      )}

      {(overdueIncoming > 0 || overdueOutgoing > 0) && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', marginBottom: 8 }}>
          {t('Просрочено: получить', "Muddati o'tgan: olish")} {money(overdueIncoming)} ·{' '}
          {t('заплатить', "to'lash")} {money(overdueOutgoing)}
        </div>
      )}

      <div style={{ display: 'grid', gap: 4 }}>
        {days.map((day) => (
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
            <span style={{ color: 'var(--text-muted)' }}>
              {day.date}
              {day.items.some((i) => i.critical) && (
                <span style={{ color: 'var(--error)' }} title={t('Есть платёж, который двигать нельзя', "Surib bo'lmaydigan to'lov bor")}>
                  {' •'}
                </span>
              )}
            </span>
            <span style={{ color: day.net < 0 ? 'var(--error)' : 'var(--success)' }}>
              {day.net >= 0 ? '+' : ''}
              {money(day.net)}
            </span>
            <span
              style={{
                fontWeight: 600,
                whiteSpace: 'nowrap',
                color: day.balance < 0 ? 'var(--error)' : 'var(--text-primary)',
              }}
            >
              {money(day.balance)}
            </span>
          </div>
        ))}
      </div>

      {undated.length > 0 && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.45 }}>
          {t(
            `Без срока: ${undated.length} долгов на ${money(undated.reduce((s, i) => s + i.remaining, 0))}. В календарь их положить некуда — проставьте срок, иначе они не попадут ни в один день.`,
            `Muddatsiz: ${undated.length} qarz, ${money(undated.reduce((s, i) => s + i.remaining, 0))}. Muddatni ko'rsating.`,
          )}
        </div>
      )}
    </div>
  );
}

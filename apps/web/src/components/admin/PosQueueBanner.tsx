'use client';

import { AlertCircle, CloudOff } from 'lucide-react';

import type { SaleQueueState } from './useSaleQueue';

// ══════════════════════════════════════════════════════════════════════
// Состояние очереди отложенных чеков — одной строкой над кассой.
//
// Очередь, о которой не говорят, — это не надёжность, а вторая тишина:
// продавец должен видеть, что три чека ещё не ушли, до того как закроет
// смену и уедет домой. Тот же приём, что у плашки снимка на карте: не
// «сломалось», а «работаем без связи».
//
// Отвергнутое сервером показываем отдельно и НЕ прячем: за такой строкой
// стоит отданный товар, и разобрать её должен человек.
// ══════════════════════════════════════════════════════════════════════

export function PosQueueBanner({ queue, lang = 'ru' }: {
  queue: SaleQueueState;
  lang?: 'ru' | 'uz';
}) {
  const nothing = queue.pending === 0 && queue.rejected.length === 0;
  if (nothing) return null;

  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
      {queue.pending > 0 && (
        <div
          className="card"
          style={{
            padding: 'var(--space-3)',
            display: 'flex',
            gap: 'var(--space-2)',
            alignItems: 'center',
            color: 'var(--warning)',
            fontSize: 'var(--text-sm)',
          }}
        >
          <CloudOff size={16} />
          <span>
            {lang === 'ru'
              ? `${queue.pending} чек(ов) ждут связи — уйдут сами, как только она появится.`
              : `${queue.pending} ta chek aloqa kutmoqda — aloqa qaytganda oʻzi yuboriladi.`}
          </span>
        </div>
      )}

      {queue.rejected.map((row, i) => (
        <div
          key={`${row.label}-${i}`}
          className="card"
          style={{
            padding: 'var(--space-3)',
            display: 'flex',
            gap: 'var(--space-2)',
            alignItems: 'center',
            background: 'var(--error-bg)',
            color: 'var(--error)',
            fontSize: 'var(--text-sm)',
          }}
        >
          <AlertCircle size={16} />
          <span>
            {lang === 'ru' ? 'Чек не принят' : 'Chek qabul qilinmadi'}: {row.label} — {row.reason}.{' '}
            {lang === 'ru' ? 'Проведите его заново.' : 'Qaytadan kiriting.'}
          </span>
        </div>
      ))}
    </div>
  );
}

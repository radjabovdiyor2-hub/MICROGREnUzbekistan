'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, RefreshCw } from 'lucide-react';

import { VISIT_NOTE_MAX, VISIT_OUTCOMES, lastVisitLabel } from '@/lib/customers/visits';

import { useVisitQueue } from './useVisitQueue';

// ══════════════════════════════════════════════════════════════════════
// «Съездил — отметь»: четыре кнопки прямо в панели точки.
//
// Ради одного нажатия в машине: открывать карточку, искать поле, писать
// текст — это то, чего в поле не делают, и потому история визитов не велась
// вовсе. Заметка необязательна и спрятана: без неё отметка ставится одним
// касанием, с ней — двумя.
// ══════════════════════════════════════════════════════════════════════

interface Props {
  customerId: number;
  lang: 'ru' | 'uz';
  /** Дней с прошлого визита. null — не были ни разу. */
  lastVisitDays: number | null;
}

const text = {
  title: { ru: 'Съездил — отметь', uz: 'Bordim — belgila' },
  note: { ru: 'Заметка (необязательно)', uz: 'Izoh (majburiy emas)' },
  saved: { ru: 'Отмечено', uz: 'Belgilandi' },
  queued: {
    ru: 'Отмечено. Связи нет — уйдёт, когда появится',
    uz: 'Belgilandi. Aloqa yoʻq — paydo boʻlganda yuboriladi',
  },
  waiting: { ru: 'ждут связи', uz: 'aloqa kutmoqda' },
};

export function VisitButtons({ customerId, lang, lastVisitDays }: Props) {
  const queryClient = useQueryClient();
  const queue = useVisitQueue();
  const [note, setNote] = useState('');
  const [done, setDone] = useState<'sent' | 'queued' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mark = useMutation({
    mutationFn: async (type: string) => {
      let res: Response;
      try {
        res = await fetch('/api/admin/customers/visits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerId, type, note, visitedAt: Date.now() }),
        });
      } catch {
        // Связи нет — не теряем отметку. Человек уже съездил, и терять
        // именно ту запись, ради которой он ехал, нельзя.
        queue.remember({ customerId, type, note });
        return { queued: true } as const;
      }

      // Отказ сервера (400, 403) — это не «нет связи»: повторять его в
      // очереди бессмысленно, отметка негодна, и человек должен узнать.
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Не удалось отметить визит');
      }
      return { queued: false } as const;
    },
    onSuccess: (result) => {
      setDone(result.queued ? 'queued' : 'sent');
      setNote('');
      setError(null);
      if (result.queued) return;
      // Карта и карточка обязаны увидеть «были сегодня»: без этого точка
      // осталась бы неотмеченной до следующего опроса раз в минуту.
      queryClient.invalidateQueries({ queryKey: ['admin-customers-map'] });
      queryClient.invalidateQueries({ queryKey: ['admin-customer', customerId] });
    },
    onError: (err: unknown) =>
      setError(err instanceof Error ? err.message : 'Ошибка при отметке'),
  });

  const seen = lastVisitLabel(lastVisitDays, lang);

  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
        }}
      >
        <span style={{ flex: 1 }}>{text.title[lang]}</span>
        {queue.pending > 0 && (
          <span style={{ color: 'var(--warning)' }}>
            {queue.pending} {text.waiting[lang]}
          </span>
        )}
        {seen && <span>{seen}</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
        {VISIT_OUTCOMES.map((o) => (
          <button
            key={o.id}
            type="button"
            className="btn btn-sm btn-ghost"
            disabled={mark.isPending}
            onClick={() => mark.mutate(o.type)}
            style={{
              minHeight: 44,
              borderLeft: `3px solid ${o.token}`,
              justifyContent: 'flex-start',
            }}
          >
            {o[lang]}
          </button>
        ))}
      </div>

      <input
        className="input"
        value={note}
        maxLength={VISIT_NOTE_MAX}
        onChange={(e) => {
          setNote(e.target.value);
          setDone(null);
        }}
        placeholder={text.note[lang]}
        aria-label={text.note[lang]}
        style={{ minHeight: 40 }}
      />

      {mark.isPending && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          <RefreshCw size={12} className="animate-spin" />
        </div>
      )}
      {done && !mark.isPending && (
        <div
          style={{
            fontSize: 'var(--text-xs)',
            color: done === 'sent' ? 'var(--success)' : 'var(--warning)',
          }}
        >
          <Check size={12} /> {done === 'sent' ? text.saved[lang] : text.queued[lang]}
        </div>
      )}
      {error && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--error)' }}>{error}</div>
      )}
    </div>
  );
}

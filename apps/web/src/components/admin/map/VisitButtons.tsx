'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, RefreshCw } from 'lucide-react';

import { clientErrorMessage } from '@/lib/safeError';
import { VISIT_NOTE_MAX, VISIT_OUTCOMES, lastVisitLabel } from '@/lib/customers/visits';

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
};

export function VisitButtons({ customerId, lang, lastVisitDays }: Props) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mark = useMutation({
    mutationFn: async (type: string) => {
      const res = await fetch('/api/admin/customers/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, type, note }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Не удалось отметить визит');
      return body;
    },
    onSuccess: () => {
      setDone(true);
      setNote('');
      setError(null);
      // Карта и карточка обязаны увидеть «были сегодня»: без этого точка
      // осталась бы неотмеченной до следующего опроса раз в минуту.
      queryClient.invalidateQueries({ queryKey: ['admin-customers-map'] });
      queryClient.invalidateQueries({ queryKey: ['admin-customer', customerId] });
    },
    onError: (err: unknown) => setError(clientErrorMessage(err, 'Ошибка при отметке')),
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
          setDone(false);
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
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--success)' }}>
          <Check size={12} /> {text.saved[lang]}
        </div>
      )}
      {error && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--error)' }}>{error}</div>
      )}
    </div>
  );
}

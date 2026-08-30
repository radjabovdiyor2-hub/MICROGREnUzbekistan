'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import { useMemo, useState } from 'react';

import { adminFetch } from '@/lib/adminClient';
import { WEEKDAYS, weekdayLabel, type Weekday } from '@/lib/customers/visitSchedule';

import { useFeedback } from '../AdminFeedback';

// ══════════════════════════════════════════════════════════════════════
// «Заезжать по субботам» — расписание клиента прямо на карточке точки.
//
// ЗАЧЕМ ЗДЕСЬ. Регулярность заезда решается там же, где на клиента
// смотрят, — иначе её не заведут вовсе. До этого она жила только в памяти
// продавца: объезд собирался по тем, кого помнят, а не по тем, к кому пора.
//
// СОХРАНЯЕТСЯ СРАЗУ, без кнопки «Сохранить»: набор дней — это семь
// переключателей, и отдельное подтверждение к ним добавляет шаг, но не
// смысл. Отказ сети виден плашкой, а не тишиной.
//
// РАСПИСАНИЕ НЕ СТАВИТ ВИЗИТ В ПЛАН САМО: оно подсказывает, кого взять на
// эту дату, а собирает объезд человек.
// ══════════════════════════════════════════════════════════════════════

interface ScheduleRow { weekday: number }

const label = {
  title: { ru: 'Заезжать по дням', uz: 'Qaysi kunlari borish' },
  none: { ru: 'Регулярных заездов нет', uz: 'Doimiy tashrif yoʻq' },
  failed: { ru: 'Не удалось сохранить расписание', uz: 'Jadval saqlanmadi' },
};

export function VisitScheduleButtons({ customerId, lang }: {
  customerId: number;
  lang: 'ru' | 'uz';
}) {
  const notify = useFeedback();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const key = ['visit-schedule', customerId];

  const { data } = useQuery<ScheduleRow[]>({
    queryKey: key,
    queryFn: async () => {
      const res = await adminFetch(`/api/admin/visit-schedules?customerId=${customerId}`);
      if (!res.ok) throw new Error('Не удалось загрузить расписание');
      const body = await res.json();
      return Array.isArray(body) ? body : [];
    },
  });

  // Дни ВЫЧИСЛЯЮТСЯ из ответа, а не копируются в своё состояние. Копия
  // потребовала бы синхронизации эффектом — то есть второго источника
  // правды о том, что выбрано, и лишнего кадра при каждом ответе сети.
  const days = useMemo<Weekday[]>(
    () => (data ?? []).map((r) => r.weekday).filter((d): d is Weekday => d >= 1 && d <= 7),
    [data],
  );

  const toggle = async (day: Weekday) => {
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
    const before = data ?? [];
    // Переключатель обязан отзываться сразу: между нажатием и ответом сети
    // в подвале ресторана проходит секунда и больше.
    queryClient.setQueryData<ScheduleRow[]>(key, next.map((weekday) => ({ weekday })));
    setBusy(true);
    try {
      const res = await adminFetch('/api/admin/visit-schedules', {
        method: 'PUT',
        body: JSON.stringify({ customerId, weekdays: next }),
      });
      if (!res.ok) throw new Error('fail');
      queryClient.invalidateQueries({ queryKey: key });
    } catch {
      // Возвращаем как было: расписание, которое показано, но не сохранено,
      // хуже отсутствующего — по нему соберут объезд.
      queryClient.setQueryData<ScheduleRow[]>(key, before);
      notify.error(label.failed[lang]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        <CalendarClock size={13} />
        {label.title[lang]}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {WEEKDAYS.map((day) => {
          const on = days.includes(day);
          return (
            <button
              key={day}
              type="button"
              disabled={busy}
              aria-pressed={on}
              onClick={() => toggle(day)}
              title={weekdayLabel(day, lang)}
              style={{
                minWidth: 40,
                minHeight: 40,
                borderRadius: 'var(--radius-full)',
                border: `1px solid ${on ? 'var(--brand-primary)' : 'var(--border)'}`,
                background: on ? 'var(--brand-primary)' : 'transparent',
                color: on ? 'var(--text-inverse)' : 'var(--text-secondary)',
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--font-semibold)',
                cursor: busy ? 'wait' : 'pointer',
              }}
            >
              {weekdayLabel(day, lang, true)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Route } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { formatLocalDate } from '@/lib/localDate';

import { FieldDayMap } from './field/FieldDayMap';
import { FieldLive } from './field/FieldLive';
import { FieldDayTimeline } from './field/FieldDayTimeline';
import {
  humanDistance,
  humanDuration,
  clock,
  type EmployeeOption,
  type FieldDayResponse,
} from './field/fieldDayTypes';

// ══════════════════════════════════════════════════════════════════════
// День в поле: где был сотрудник, сколько простоял, сколько ехал.
//
// Отвечает на вопрос владельца «а не мухлёвка ли» — тот самый, который
// уже записан в схеме рядом с отметкой визита. Разница в том, что отметка
// подтверждает ОДИН момент, а здесь виден весь день подряд, и дыры в нём
// видны тоже.
//
// СИСТЕМА НЕ ОБВИНЯЕТ. Она показывает числа и говорит, где они не сходятся
// с дорогой; вывод делает человек. Автосигналов и связи с зарплатой здесь
// нет намеренно — это решение владельца, а не упущение.
//
// Лента вынесена в `field/FieldDayTimeline.tsx`: вместе файл переваливал
// за лимит в 200 строк.
// ══════════════════════════════════════════════════════════════════════

export function AdminFieldDay({ lang = 'ru' }: { lang?: 'ru' | 'uz' }) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const [date, setDate] = useState(() => formatLocalDate());
  const [employeeId, setEmployeeId] = useState('');

  const { data: employees = [] } = useQuery<EmployeeOption[]>({
    queryKey: ['admin-employees-list'],
    queryFn: async () => {
      const res = await fetch('/api/inventory/employees');
      const data = await res.json();
      return data.employees || [];
    },
  });

  const { data, isLoading } = useQuery<FieldDayResponse>({
    queryKey: ['field-day', employeeId, date],
    enabled: employeeId !== '',
    queryFn: async () => {
      const res = await fetch(`/api/admin/tracking/day?employee=${employeeId}&date=${date}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Не удалось загрузить день');
      return body as FieldDayResponse;
    },
  });

  const day = data?.day ?? null;

  return (
    <div>
      <h2
        style={{
          fontSize: 'var(--text-xl)',
          fontWeight: 'var(--font-bold)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 'var(--space-4)',
        }}
      >
        <Route size={24} /> {t('День в поле', 'Dala kuni')}
      </h2>

      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
        <select
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          className="input"
          style={{ maxWidth: 240 }}
        >
          <option value="">{t('Выберите сотрудника', 'Xodimni tanlang')}</option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="input"
          style={{ maxWidth: 180 }}
        />
      </div>

      {/* Никого не выбрали — показываем, кто в поле ПРЯМО СЕЙЧАС.
          Это чаще нужный ответ, чем «выберите сотрудника»: разбор дня
          делают вечером, а «где все» спрашивают посреди дня. */}
      {employeeId === '' && <FieldLive lang={lang} />}

      {employeeId !== '' && isLoading && (
        <p style={{ color: 'var(--text-muted)' }}>{t('Собираю день…', 'Kun yig‘ilmoqda…')}</p>
      )}

      {employeeId !== '' && !isLoading && !day && (
        // Пусто — это не поломка: человек мог не включать трансляцию.
        // Так и говорим, вместо пустого экрана без объяснений.
        <p style={{ color: 'var(--text-muted)' }}>
          {t(
            'Трека за этот день нет — трансляция геопозиции не включалась.',
            'Bu kun uchun trek yo‘q — geopozitsiya translyatsiyasi yoqilmagan.',
          )}
        </p>
      )}

      {day && (
        <>
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-4)',
              flexWrap: 'wrap',
              padding: 'var(--space-3)',
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)',
              marginBottom: 'var(--space-4)',
              fontSize: 'var(--text-sm)',
            }}
          >
            <span>
              {t('Смена', 'Smena')}: {clock(day.startedAt)}
              {day.endedAt ? `–${clock(day.endedAt)}` : ''}
            </span>
            <span>
              {t('Пройдено', 'Bosib o‘tilgan')}: {humanDistance(day.meters)}
            </span>
            <span>
              {t('В движении', 'Harakatda')}: {humanDuration(day.movingSec, lang)}
            </span>
            <span>
              {t('Заездов', 'To‘xtashlar')}: {day.stops}
            </span>
          </div>

          {/* Карта дня — над лентой: сперва «где ездил», потом «что там
              было». Обратный порядок заставляет читать список без карты
              перед глазами. */}
          {data && data.track.length > 0 && (
            <FieldDayMap
              track={data.track}
              stays={data.stays.map((stay) => ({
                id: stay.id,
                latitude: stay.customer.latitude,
                longitude: stay.customer.longitude,
                dwellSec: stay.dwellSec,
                confirmedBy: stay.confirmedBy,
              }))}
            />
          )}

          {data && data.stays.length > 0 ? (
            <FieldDayTimeline stays={data.stays} legs={data.legs} lang={lang} />
          ) : (
            <p style={{ color: 'var(--text-muted)' }}>
              {t(
                'Трек есть, но ни одной остановки у клиентов не нашлось.',
                'Trek bor, lekin mijozlarda to‘xtash topilmadi.',
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
}

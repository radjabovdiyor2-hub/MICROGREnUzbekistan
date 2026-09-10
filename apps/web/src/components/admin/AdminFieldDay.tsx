'use client';

import { useState } from 'react';
import { Route } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { formatLocalDate } from '@/lib/localDate';
import { timeoutSignal } from '@/lib/net/connection';

import { FieldDayMap } from './field/FieldDayMap';
import { FieldDaySummary } from './field/FieldDaySummary';
import { FieldLive } from './field/FieldLive';
import { FieldDayTimeline } from './field/FieldDayTimeline';
import { type EmployeeOption, type FieldDayResponse } from './field/fieldDayTypes';

// ══════════════════════════════════════════════════════════════════════
// День в поле: где был сотрудник, сколько простоял, сколько ехал.
//
// Отметка визита подтверждает ОДИН момент, а здесь виден весь день — и
// дыры в нём тоже.
//
// СИСТЕМА НЕ ОБВИНЯЕТ: показывает числа, вывод делает человек. Связи с
// зарплатой ЗДЕСЬ нет намеренно — смена платит за присутствие, а
// километры и стоянки это выработка, и это отдельный разговор.
//
// Лента — в `field/FieldDayTimeline.tsx`: файл упирается в 200 строк.
// ══════════════════════════════════════════════════════════════════════

export function AdminFieldDay({
  lang = 'ru',
  focus = '',
  mine = false,
}: {
  lang?: 'ru' | 'uz';
  /** Сотрудник из ссылки Telegram. Без него кнопка бота вела на пустой экран. */
  focus?: string;
  /** Свой день: дверь сама отдаёт продавцу только его собственный. */
  mine?: boolean;
}) {
  const t = (ru: string, uz: string) => (lang === 'ru' ? ru : uz);
  const [date, setDate] = useState(() => formatLocalDate());
  // Ссылка задаёт НАЧАЛЬНОЕ значение, дальше решает человек: синхронизация
  // эффектом вернула бы прежнего сотрудника после переключения.
  const [employeeId, setEmployeeId] = useState(focus);

  const { data: employees = [] } = useQuery<EmployeeOption[]>({
    queryKey: ['admin-employees-list'],
    enabled: !mine, // продавцу список сотрудников не положен
    queryFn: async () => {
      const res = await fetch('/api/inventory/employees');
      const data = await res.json();
      return data.employees || [];
    },
  });

  const { data, isLoading } = useQuery<FieldDayResponse>({
    queryKey: ['field-day', mine ? 'self' : employeeId, date],
    // В своём дне выбирать некого — сервер знает, чей он, по подписи.
    enabled: mine || employeeId !== '',
    queryFn: async () => {
      // День собирается на сервере (пересборка стоянок и плеч) — ждём
      // дольше обычного, но всё-таки конечно.
      const who = mine ? '' : `employee=${employeeId}&`;
      const res = await fetch(`/api/admin/tracking/day?${who}date=${date}`, {
        signal: timeoutSignal(25_000),
      });
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
        <Route size={24} /> {mine ? t('Мой день', 'Mening kunim') : t('День в поле', 'Dala kuni')}
      </h2>

      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
        {/* Выбор — только владельцу: свой день выбирать не из чего. */}
        {!mine && (
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
        )}
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
          <FieldDaySummary
            day={day}
            idle={data?.idle ?? []}
            gaps={data?.gaps ?? 0}
            lang={lang}
          />

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

          {data && (data.stays.length > 0 || data.idle.length > 0) ? (
            <FieldDayTimeline
              stays={data.stays}
              legs={data.legs}
              idle={data.idle}
              idleAfterMin={data.idleAfterMin}
              lang={lang}
            />
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

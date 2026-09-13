'use client';

import { createContext, useContext, type ReactNode } from 'react';

import { useFieldTracker, type FieldTracker } from './useFieldTracker';
import { useShift, type Shift } from './useShift';

// ══════════════════════════════════════════════════════════════════════
// Смена и запись маршрута — одни на весь сеанс полевого сотрудника.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ПОСТАВЩИК. Трекер создавался кнопкой «Начал смену», а
// кнопка живёт на вкладках «Клиенты» и «Мой рейс». Роутер вкладок
// размонтирует неактивную, и вместе с кнопкой умирал трекер: продавец
// открывал кассу посреди смены — запись останавливалась до его
// возвращения. На карте владельца это выглядело как «молчит», хотя
// человек в это время продавал.
//
// Поэтому смена и запись живут в оболочке админки, над роутером, и
// переживают любые переходы. Кнопка только показывает их состояние.
//
// ОДИН ТРЕКЕР, А НЕ ДВА. Кнопок на экране может быть сколько угодно, а
// трекер у сеанса один: две записи слали бы одни и те же крошки дважды и
// спорили бы за общую очередь.
//
// ВЛАДЕЛЬЦУ ПОСТАВЩИК НЕ НУЖЕН. Он смотрит чужие дни, а не пишет свой, и
// опрос его «смены» раз в две минуты был бы запросом без ответа.
// ══════════════════════════════════════════════════════════════════════

export interface FieldSession {
  shift: Shift;
  tracker: FieldTracker;
}

const FieldSessionContext = createContext<FieldSession | null>(null);

function ActiveFieldSession({ children }: { children: ReactNode }) {
  const shift = useShift();
  // `undefined`, пока сервер не ответил: трогать запись в этот момент
  // нельзя ни в какую сторону — см. `useFieldTracker`.
  const tracker = useFieldTracker(shift.loading ? undefined : shift.open);
  return (
    <FieldSessionContext.Provider value={{ shift, tracker }}>
      {children}
    </FieldSessionContext.Provider>
  );
}

/**
 * @param enabled полевой ли это сеанс. Меняться за время сеанса не должен:
 *   это роль вошедшего, а не состояние экрана.
 */
export function FieldTrackerProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return <ActiveFieldSession>{children}</ActiveFieldSession>;
}

/** Смена и запись сеанса. `null` — поставщика нет: это владелец. */
export function useFieldSession(): FieldSession | null {
  return useContext(FieldSessionContext);
}

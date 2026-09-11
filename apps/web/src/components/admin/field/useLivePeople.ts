'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { isOffline, pollInterval, timeoutSignal } from '@/lib/net/connection';
import { MIN_INTERVAL_MS } from '@/lib/tracking/pingQueue';

import type { LiveAnswer, LivePerson } from './livePeople';

// ══════════════════════════════════════════════════════════════════════
// Живой слой поля: кто в поле и где — для общего списка и для слежения.
//
// ЧАСТОТА ОПРОСА = ЧАСТОТЕ ОТПРАВИТЕЛЯ. `MIN_INTERVAL_MS` импортируется, а
// не переписывается числом: телефон физически не может прислать новую
// точку чаще, и спрашивать чаще — жечь чужой трафик впустую. Основной путь
// вообще не опрос: тему `field` публикует приёмник крошек, и `useRealtime`
// сбрасывает этот кэш через секунду после того, как точка доехала.
//
// МОЛЧАНИЕ СТАРЕЕТ, ПОКА ОТВЕТ ЛЕЖИТ В КЭШЕ. Сервер считает «молчит N
// минут» в момент ответа, а ответ живёт ещё минуту, а без сети — сколько
// угодно. Показывать серверное число как есть значит утверждать «на связи»
// про позицию, которой уже несколько минут.
//
// ВОЗРАСТ СЧИТАЕТСЯ ПО `dataUpdatedAt`, а не сравнением с меткой сервера:
// это разница двух ЛОКАЛЬНЫХ моментов, поэтому сбитые часы на неё не
// влияют. Тикер нужен, чтобы число росло и тогда, когда опрос остановлен.
// ══════════════════════════════════════════════════════════════════════

/** Как часто пересчитывать возраст молчания на экране. */
const TICK_MS = 30_000;

export function useLivePeople(employeeId = '') {
  const { data, isLoading, dataUpdatedAt } = useQuery<LiveAnswer>({
    queryKey: employeeId ? ['field-watch', employeeId] : ['field-live'],
    refetchInterval: () => pollInterval(MIN_INTERVAL_MS),
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const query = employeeId ? `?employee=${encodeURIComponent(employeeId)}` : '';
      const res = await fetch(`/api/admin/tracking/live${query}`, { signal: timeoutSignal() });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Не удалось загрузить');
      return body as LiveAnswer;
    },
  });

  // Часы экрана. Держим их СОСТОЯНИЕМ, а не спрашиваем время во время
  // отрисовки: отрисовка обязана быть чистой, иначе одно и то же состояние
  // даёт разный результат от прогона к прогону.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // Состояние сети — подпиской, а не вопросом во время отрисовки:
  // `navigator.onLine` во время рендера — обращение к внешнему миру, и
  // React справедливо на это ругается. Заодно баннер теперь появляется и
  // исчезает сам, а не ждёт следующего тика.
  const [frozen, setFrozen] = useState(false);
  useEffect(() => {
    const sync = () => setFrozen(isOffline());
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  return {
    people: data?.people ?? [],
    isLoading,
    /** Сколько прошло с получения ответа: на столько и состарилось молчание. */
    ageMs: dataUpdatedAt ? now - dataUpdatedAt : 0,
    /**
     * Без сети опрос ОСТАНОВЛЕН (`pollInterval` отдаёт `false`), и экран
     * замирает молча. Молчащий живой экран — это новый способ соврать,
     * поэтому про остановку говорим вслух.
     */
    frozen,
  };
}

export type { LivePerson };

'use client';

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { pollInterval, timeoutSignal } from '@/lib/net/connection';

// ══════════════════════════════════════════════════════════════════════
// Своя смена: открыта ли, и как её открыть или закрыть.
//
// СОСТОЯНИЕ БЕРЁТСЯ С СЕРВЕРА, а не из памяти вкладки. До этого запись
// дня включалась флагом в `localStorage`, и о нём знала только та
// вкладка, где нажали: человек открывал смену в боте, а приложение об
// этом не знало и продолжало молчать.
//
// СПРАШИВАЕМ РЕДКО. Смену открывают раз в день, и опрашивать сервер чаще
// раза в пару минут незачем — это карман и заряд. Но опрашиваем: смену
// могли открыть в боте, пока приложение лежало в кармане открытым.
// ══════════════════════════════════════════════════════════════════════

const EVERY_MS = 2 * 60 * 1000;

/** Отказ с кодом: по нему решаем, повторять запрос или это бесполезно. */
class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

interface ShiftState {
  open: boolean;
  startedAt: string | null;
  openedVia: string | null;
}

export interface Shift {
  open: boolean;
  startedAt: Date | null;
  /**
   * Почему смена не открылась. `null` — всё в порядке.
   *
   * БЕЗ ЭТОГО КНОПКА МОЛЧАЛА. Живая проверка: сервер честно отвечал
   * «сотрудник не найден», а на экране не менялось ничего — человек жал
   * кнопку и не понимал, почему смена не идёт.
   */
  error: string | null;
  /** Запрос ещё идёт и состояние неизвестно. Не то же, что «закрыта». */
  loading: boolean;
  busy: boolean;
  start: () => void;
  finish: () => void;
}

/**
 * Причина отказа словами, понятными человеку в поле.
 *
 * Рубеж доступа стоит в middleware и отвечает английским «Unauthorized» —
 * это общий ответ на весь API, и менять его ради одной двери нельзя. Но
 * показывать продавцу английское слово тоже нельзя: для него это просто
 * «не работает».
 */
function humanReason(status: number, serverText?: string): string {
  if (status === 401) return 'Сессия истекла — войдите заново';
  // Всё остальное сервер объясняет сам и по-русски: «сотрудник не
  // найден», «совпадают имена сотрудников». Эти слова чинит владелец, и
  // передать их надо дословно.
  return serverText?.trim() || 'Не получилось открыть смену';
}

export function useShift(): Shift {
  const client = useQueryClient();

  const state = useQuery<ShiftState>({
    queryKey: ['shift-current'],
    queryFn: async () => {
      const res = await fetch('/api/shift', { signal: timeoutSignal() });
      if (!res.ok) throw new HttpError(res.status);
      return (await res.json()) as ShiftState;
    },
    refetchInterval: pollInterval(EVERY_MS),
    // Вернулись во вкладку — первым делом узнаём, не закрыли ли смену
    // из бота. Это как раз тот случай, ради которого проверка нужна.
    refetchOnWindowFocus: true,
    // ОТКАЗ ДОСТУПА НЕ ПОВТОРЯЮТ. По умолчанию React Query делает три
    // повтора, и живая проверка показала ровно четыре запроса подряд на
    // истёкшей сессии: одну попытку и три бесполезных. Сессия за секунду
    // не вернётся.
    retry: (count, error) => !(error instanceof HttpError && error.status === 401) && count < 2,
    // Перемонтирование НЕ перезапрашивает: экран продавца пересобирается
    // при каждом переходе между вкладками, и живая проверка показала
    // четыре одинаковых запроса подряд там, где хватает одного. Свежие
    // данные в памяти для этого и лежат.
    refetchOnMount: false,
    staleTime: 30_000,
  });

  const change = useMutation({
    mutationFn: async (action: 'open' | 'close') => {
      const res = await fetch('/api/shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, via: 'pwa' }),
      });
      if (!res.ok) {
        // Слова сервера доходят до человека без пересказа: «сотрудник не
        // найден» и «совпадают имена» чинит владелец, и продавцу надо
        // передать ему ровно эту фразу.
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(humanReason(res.status, body?.error));
      }
      return (await res.json()) as ShiftState;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['shift-current'] });
    },
  });

  const start = useCallback(() => change.mutate('open'), [change]);
  const finish = useCallback(() => change.mutate('close'), [change]);

  const startedAt = state.data?.startedAt ? new Date(state.data.startedAt) : null;

  return {
    open: state.data?.open ?? false,
    startedAt,
    error: change.error instanceof Error ? change.error.message : null,
    loading: state.isLoading,
    busy: change.isPending,
    start,
    finish,
  };
}

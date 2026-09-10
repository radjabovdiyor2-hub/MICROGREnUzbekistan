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

interface ShiftState {
  open: boolean;
  startedAt: string | null;
  openedVia: string | null;
}

export interface Shift {
  open: boolean;
  startedAt: Date | null;
  /** Запрос ещё идёт и состояние неизвестно. Не то же, что «закрыта». */
  loading: boolean;
  busy: boolean;
  start: () => void;
  finish: () => void;
}

export function useShift(): Shift {
  const client = useQueryClient();

  const state = useQuery<ShiftState>({
    queryKey: ['shift-current'],
    queryFn: async () => {
      const res = await fetch('/api/shift', { signal: timeoutSignal() });
      if (!res.ok) throw new Error('shift');
      return (await res.json()) as ShiftState;
    },
    refetchInterval: pollInterval(EVERY_MS),
    // Вернулись во вкладку — первым делом узнаём, не закрыли ли смену
    // из бота. Это как раз тот случай, ради которого проверка нужна.
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const change = useMutation({
    mutationFn: async (action: 'open' | 'close') => {
      const res = await fetch('/api/shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, via: 'pwa' }),
      });
      if (!res.ok) throw new Error('shift');
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
    loading: state.isLoading,
    busy: change.isPending,
    start,
    finish,
  };
}

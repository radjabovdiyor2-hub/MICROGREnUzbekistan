'use client';

import { useRef, useState } from 'react';

import { clientErrorMessage } from '@/lib/safeError';

// ══════════════════════════════════════════════════════════════════════
// Прогон геокодера: батч за батчем, пока офис не скажет «всё».
//
// Один HTTP-запрос обрабатывает 25 адресов — это около полуминуты одних
// пауз между обращениями к провайдеру. Гнать всю базу одним запросом
// нельзя (упрётся в таймаут), а фоновая очередь ради этого — лишняя
// инфраструктура: состояние прогона целиком в базе, оборванный проход
// продолжится со следующего нажатия.
//
// Поэтому цикл живёт здесь, в браузере, и рисует прогресс. Останов —
// либо `done`, либо кнопка «Стоп», либо отказ офиса.
// ══════════════════════════════════════════════════════════════════════

const BATCH = 25;

/** Предохранитель от бесконечного цикла, если офис всегда отвечает done=false. */
const MAX_ROUNDS = 200;

export interface GeocodeProgress {
  processed: number;
  placed: number;
  cached: number;
  failed: number;
  /** Точность «город» — пин не ставим, клиент остаётся в лотке. */
  tooCoarse: number;
  noAddress: number;
}

const EMPTY: GeocodeProgress = {
  processed: 0,
  placed: 0,
  cached: 0,
  failed: 0,
  tooCoarse: 0,
  noAddress: 0,
};

export function useGeocodePass(onBatchDone: () => void) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<GeocodeProgress>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const stopped = useRef(false);

  const stop = () => {
    stopped.current = true;
  };

  const start = async (city?: string) => {
    if (running) return;
    stopped.current = false;
    setRunning(true);
    setError(null);
    setFinished(false);
    setProgress(EMPTY);

    const total = { ...EMPTY };

    try {
      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        if (stopped.current) break;

        const res = await fetch('/api/admin/customers/geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batch: BATCH, city: city ?? null }),
        });
        const body = await res.json().catch(() => null);
        // Сообщение офиса показываем как есть: «ни один геокодер не
        // настроен» — осмысленный ответ, и общая ошибка спрятала бы его.
        if (!res.ok) throw new Error(body?.error || 'Геокодирование не удалось');

        total.processed += Number(body.processed ?? 0);
        total.placed += Number(body.placed ?? 0);
        total.cached += Number(body.cached ?? 0);
        total.failed += Number(body.failed ?? 0);
        total.tooCoarse += Number(body.too_coarse ?? 0);
        total.noAddress += Number(body.no_address ?? 0);
        setProgress({ ...total });

        onBatchDone();

        if (body.done || Number(body.processed ?? 0) === 0) {
          setFinished(true);
          break;
        }
      }
    } catch (err: unknown) {
      setError(clientErrorMessage(err, 'Ошибка геокодирования'));
    } finally {
      setRunning(false);
    }
  };

  return { start, stop, running, progress, error, finished };
}

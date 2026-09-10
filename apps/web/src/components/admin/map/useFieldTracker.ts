'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { watchPosition, type StopWatch, type WatchFailure } from '@/lib/geo/watch';
import { formatLocalDate } from '@/lib/localDate';
import { isOffline, isSlowLink } from '@/lib/net/connection';
import { sendPings } from '@/lib/tracking/sendPings';
import {
  MAX_QUEUE,
  PING_QUEUE_KEY,
  enqueue,
  readQueue,
  readShift,
  shouldKeep,
  takeBatch,
  writeQueue,
  writeShift,
  type QueuedPing,
} from '@/lib/tracking/pingQueue';

// ══════════════════════════════════════════════════════════════════════
// Запись дня браузером: слежение, очередь, отправка.
//
// Вся арифметика — в `lib/tracking/pingQueue.ts`; здесь только провода:
// подписка на приёмник, хранилище и сеть. Так решение «писать ли эту
// крошку» проверяется тестами без браузера.
//
// ЗАПИСЬ ПЕРЕЖИВАЕТ ПЕРЕЗАГРУЗКУ. Флаг «смена пишется» лежит рядом с
// очередью и привязан к дате: продавец обновил страницу или вкладка
// выгрузилась из памяти — запись поднимается сама. Иначе день обрывался
// бы молча, и человек узнавал бы об этом вечером от владельца.
//
// СЛАБАЯ СВЯЗЬ. Отправляем реже и большими пачками: десяток запросов по
// одной крошке на двух палках забьют канал, по которому уходит фотоотчёт.
// Совсем без связи не пробуем вовсе — очередь дождётся, а заряд нет.
// ══════════════════════════════════════════════════════════════════════

/** Как часто пробуем отдать накопленное. На слабой связи — вчетверо реже. */
const FLUSH_MS = 60_000;
const SLOW_FLUSH_FACTOR = 4;

export interface FieldTracker {
  on: boolean;
  /** Крошек ждёт отправки. Ноль при живой связи — норма. */
  pending: number;
  /** Почему не пишется. `null` — пишется или ещё не начинали. */
  failure: WatchFailure | null;
  /**
   * Сервер отказался принимать трек: уволен, имя совпадает с чужим, сессия
   * истекла. Ждать бесполезно — это чинит владелец, а не повтор запроса.
   */
  rejected: string | null;
  /** Когда последняя пачка дошла до сервера. */
  sentAt: number | null;
  start: () => void;
  stop: () => void;
}

export function useFieldTracker(): FieldTracker {
  const [on, setOn] = useState(false);
  const [pending, setPending] = useState(0);
  const [failure, setFailure] = useState<WatchFailure | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<number | null>(null);

  const queue = useRef<QueuedPing[]>([]);
  const last = useRef<QueuedPing | null>(null);
  const stopWatch = useRef<StopWatch | null>(null);
  const sending = useRef(false);

  /** Отдать накопленное. Пачка снимается с очереди только после успеха. */
  const flush = useCallback(async () => {
    if (sending.current || queue.current.length === 0 || isOffline()) return;
    const batch = takeBatch(queue.current);
    sending.current = true;
    try {
      const result = await sendPings(batch);
      if (result.kind === 'retry') return;
      if (result.kind === 'rejected') {
        setRejected(result.message);
        // Слежение снимаем: заряд жечь незачем. Очередь НЕ трогаем — если
        // владелец поправит карточку, накопленное уйдёт целиком.
        stopWatch.current?.();
        stopWatch.current = null;
        setOn(false);
        writeShift(localStorage, false, formatLocalDate());
        return;
      }
      // Сервер принял — снимаем ровно отправленное, а не всю очередь: за
      // время запроса приёмник мог добавить новые крошки.
      queue.current = queue.current.slice(batch.length);
      writeQueue(localStorage, queue.current);
      setPending(queue.current.length);
      setSentAt(Date.now());
    } finally {
      sending.current = false;
    }
  }, []);

  const start = useCallback(() => {
    if (stopWatch.current) return;
    setFailure(null);
    setRejected(null);
    stopWatch.current = watchPosition(
      (sample) => {
        // Удачный замер гасит прежнюю жалобу. Потеря неба в подвале —
        // дело минутное, а надпись «спутники не ловятся» без этого висела
        // бы до конца смены и врала бы ровно тогда, когда запись идёт.
        setFailure((before) => (before === null ? before : null));
        const ping: QueuedPing = {
          at: sample.at,
          latitude: sample.latitude,
          longitude: sample.longitude,
          accuracyM: sample.accuracyM,
          source: 'pwa',
          speedMps: sample.speedMps,
          headingDeg: sample.headingDeg,
        };
        if (!shouldKeep(last.current, ping)) return;
        last.current = ping;
        queue.current = enqueue(queue.current, ping);
        writeQueue(localStorage, queue.current);
        setPending(queue.current.length);
        // Первую крошку отдаём сразу: владелец должен увидеть, что
        // человек поехал, не дожидаясь минуты.
        if (queue.current.length === 1) void flush();
      },
      (reason) => {
        setFailure(reason);
        // Отказ в доступе не лечится ожиданием: слежение снимаем, чтобы
        // не жечь заряд впустую, и говорим об этом на экране.
        if (reason === 'denied') {
          stopWatch.current?.();
          stopWatch.current = null;
          setOn(false);
          writeShift(localStorage, false, formatLocalDate());
        }
      },
    );
    setOn(true);
    writeShift(localStorage, true, formatLocalDate());
  }, [flush]);

  const stop = useCallback(() => {
    stopWatch.current?.();
    stopWatch.current = null;
    setOn(false);
    writeShift(localStorage, false, formatLocalDate());
    void flush();
  }, [flush]);

  // Поднимаем очередь и, если смена была включена, само слежение.
  useEffect(() => {
    queue.current = readQueue(localStorage);
    setPending(queue.current.length);
    last.current = queue.current[queue.current.length - 1] ?? null;
    if (readShift(localStorage, formatLocalDate())) start();
    return () => {
      stopWatch.current?.();
      stopWatch.current = null;
    };
    // Только при монтировании: `start` стабилен, а повторный запуск
    // подписался бы на приёмник второй раз.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Отправка по таймеру, при возвращении связи и при уходе со страницы.
  useEffect(() => {
    if (!on) return;
    const every = isSlowLink() ? FLUSH_MS * SLOW_FLUSH_FACTOR : FLUSH_MS;
    const timer = setInterval(() => void flush(), every);
    const wake = () => void flush();
    window.addEventListener('online', wake);
    // `pagehide`, а не `beforeunload`: на телефоне вкладку не закрывают —
    // её выгружает система, и второе событие там не приходит вовсе.
    window.addEventListener('pagehide', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', wake);
      window.removeEventListener('pagehide', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [on, flush]);

  // Очередь общая на вкладки: две открытые карты не должны отправлять
  // одно и то же дважды и затирать счётчик друг у друга.
  useEffect(() => {
    const sync = (e: StorageEvent) => {
      if (e.key !== PING_QUEUE_KEY) return;
      queue.current = readQueue(localStorage);
      setPending(Math.min(queue.current.length, MAX_QUEUE));
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  return { on, pending, failure, rejected, sentAt, start, stop };
}

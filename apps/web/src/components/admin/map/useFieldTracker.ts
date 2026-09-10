'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  watchPosition,
  type StopWatch,
  type WatchFailure,
  type WatchSample,
} from '@/lib/geo/watch';
import { watchNative } from '@/lib/native/geo';
import { isOffline, isSlowLink } from '@/lib/net/connection';
import { ensureDeviceKey, readDeviceKey } from '@/lib/tracking/deviceKey';
import { sendPings } from '@/lib/tracking/sendPings';
import {
  MAX_QUEUE,
  PING_QUEUE_KEY,
  enqueue,
  readQueue,
  shouldKeep,
  takeBatch,
  writeQueue,
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
//
// В ПРИЛОЖЕНИИ КООРДИНАТЫ ДАЁТ СИСТЕМА, а не вкладка: `watchNative`
// работает с погашенным экраном, `watchPosition` — только пока на экран
// смотрят. Всё остальное — очередь, отбор крошек, отправка — одно и то же
// на оба случая, и разъезжаться этим двум путям нельзя: день, снятый
// приложением и браузером, должен считаться одной арифметикой.
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

/**
 * @param shiftOpen открыта ли смена. `undefined` — ещё не знаем: сервер не
 *   ответил, и трогать слежение в этот момент нельзя ни в какую сторону.
 */
export function useFieldTracker(shiftOpen?: boolean): FieldTracker {
  const [on, setOn] = useState(false);
  const [pending, setPending] = useState(0);
  const [failure, setFailure] = useState<WatchFailure | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<number | null>(null);

  const queue = useRef<QueuedPing[]>([]);
  const last = useRef<QueuedPing | null>(null);
  const stopWatch = useRef<StopWatch | null>(null);
  const sending = useRef(false);
  // Ключ приложения. В браузере остаётся `null` навсегда — и это норма.
  const deviceKey = useRef<string | null>(null);

  /** Отдать накопленное. Пачка снимается с очереди только после успеха. */
  const flush = useCallback(async () => {
    if (sending.current || queue.current.length === 0 || isOffline()) return;
    const batch = takeBatch(queue.current);
    sending.current = true;
    try {
      const result = await sendPings(batch, deviceKey.current);
      if (result.kind === 'retry') return;
      if (result.kind === 'rejected') {
        setRejected(result.message);
        // Слежение снимаем: заряд жечь незачем. Очередь НЕ трогаем — если
        // владелец поправит карточку, накопленное уйдёт целиком.
        stopWatch.current?.();
        stopWatch.current = null;
        setOn(false);
        // Смену НЕ закрываем: сервер отказался принимать трек, а
        // работать человек не переставал. Закрыть её отсюда значило бы
        // стереть ему рабочий день из-за сбоя доступа.
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

    // Ключ просим В МОМЕНТ ОТКРЫТИЯ СМЕНЫ, а не при загрузке экрана: здесь
    // человек только что вошёл по PIN, сессия свежая, и запрос пройдёт.
    // Не дожидаемся ответа: первая крошка уйдёт по сессии, ключ
    // подхватится следующей пачкой.
    deviceKey.current = readDeviceKey(localStorage);
    void ensureDeviceKey().then((key) => {
      if (key) deviceKey.current = key;
    });

    const onSample = (sample: WatchSample) => {
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
    };

    const onFail = (reason: WatchFailure) => {
      setFailure(reason);
      // Отказ в доступе не лечится ожиданием: слежение снимаем, чтобы
      // не жечь заряд впустую, и говорим об этом на экране.
      if (reason === 'denied') {
        stopWatch.current?.();
        stopWatch.current = null;
        setOn(false);
      }
    };

    // СНАЧАЛА СИСТЕМА, ПОТОМ ВКЛАДКА. В приложении координаты даёт родная
    // служба: она пишет с погашенным экраном. `null` означает, что мы в
    // обычном браузере (или в старой сборке приложения без модуля), — и
    // тогда работает прежний путь, а не пустота.
    stopWatch.current = watchNative(onSample, onFail) ?? watchPosition(onSample, onFail);
    setOn(true);
  }, [flush]);

  const stop = useCallback(() => {
    stopWatch.current?.();
    stopWatch.current = null;
    setOn(false);
    void flush();
  }, [flush]);

  // Поднимаем накопленное без связи. Слежение отсюда не запускаем: им
  // распоряжается смена, а её состояние приходит с сервера отдельно.
  useEffect(() => {
    queue.current = readQueue(localStorage);
    setPending(queue.current.length);
    last.current = queue.current[queue.current.length - 1] ?? null;
    return () => {
      stopWatch.current?.();
      stopWatch.current = null;
    };
  }, []);

  // ЗАПИСЬ СЛУШАЕТСЯ СМЕНЫ, а не своей кнопки.
  //
  // Раньше у записи был собственный флаг в `localStorage`, и о нём знала
  // только та вкладка, где нажали: человек открывал смену в боте, а
  // приложение продолжало молчать. Теперь правда одна и она на сервере.
  //
  // `undefined` — сервер ещё не ответил. В этот момент не делаем НИЧЕГО:
  // выключить слежение «на всякий случай» значит потерять кусок трека при
  // каждом обновлении страницы.
  useEffect(() => {
    if (shiftOpen === undefined) return;
    if (shiftOpen && !stopWatch.current) start();
    if (!shiftOpen && stopWatch.current) stop();
  }, [shiftOpen, start, stop]);

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

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  dequeue,
  enqueue,
  readQueue,
  splitByAge,
  toRequestBody,
  writeQueue,
  type QueuedSale,
} from '@/lib/pos/saleQueue';

// ══════════════════════════════════════════════════════════════════════
// Досылка чеков, пробитых без связи.
//
// Пробуем в трёх случаях: при открытии кассы, при возвращении связи
// (событие `online`) и сразу после новой продажи. Таймера нет — сеть сама
// говорит, когда появилась, а опрос при мёртвой сети только жжёт батарею.
// Тот же приём, что у очереди визитов (map/useVisitQueue).
//
// По одной записи и последовательно. Пачка параллельных запросов по
// возвращении связи — верный способ получить половину отказов на первой же
// слабой сети, и это при том, что каждый отказ здесь стоит чека.
// ══════════════════════════════════════════════════════════════════════

export interface SaleQueueState {
  /** Сколько чеков ждёт связи. */
  pending: number;
  /** Чеки, которые сервер отверг: их разбирают руками, а не досылают. */
  rejected: { label: string; reason: string }[];
  /** Сколько выброшено по сроку. */
  expired: number;
  remember: (sale: QueuedSale) => void;
  flush: () => Promise<void>;
}

export function useSaleQueue(): SaleQueueState {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(0);
  const [expired, setExpired] = useState(0);
  const [rejected, setRejected] = useState<{ label: string; reason: string }[]>([]);

  const flush = useCallback(async () => {
    // Уступаем такт прежде, чем трогать состояние: flush зовётся из эффекта.
    await Promise.resolve();

    let queue = readQueue();
    if (queue.length === 0) {
      setPending(0);
      return;
    }

    const { fresh, stale } = splitByAge(queue);
    if (stale.length > 0) {
      // Молча выброшенный чек — это проданный товар, которого как будто не
      // было. Говорим вслух и оставляем след на экране.
      setExpired((n) => n + stale.length);
      setRejected((prev) => [
        ...prev,
        ...stale.map((s) => ({ label: s.label, reason: 'пролежал слишком долго' })),
      ]);
      queue = fresh;
      writeQueue(queue);
    }

    let sent = 0;
    for (const item of fresh) {
      try {
        const res = await fetch('/api/inventory/pos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(toRequestBody(item)),
        });

        // 5xx — сервер жив, но ему плохо: повод попробовать позже.
        if (res.status >= 500) break;

        const data = await res.json().catch(() => null);

        // Отказ по существу (400, 403, 404) в очереди застрянет навсегда:
        // сервер уже сказал, что не примет. Снимаем — но человек обязан
        // узнать: за этой записью стоит отданный товар.
        if (!res.ok || data?.success !== true) {
          setRejected((prev) => [
            ...prev,
            { label: item.label, reason: data?.error || `сервер ответил ${res.status}` },
          ]);
        } else {
          sent++;
        }

        queue = dequeue(queue, item.key);
        writeQueue(queue);
      } catch {
        // Связи снова нет — остальное подождёт.
        break;
      }
    }

    setPending(queue.length);
    if (sent > 0) {
      // Остатки, карточка клиента и точка на карте изменились разом.
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      queryClient.invalidateQueries({ queryKey: ['admin-customer'] });
      queryClient.invalidateQueries({ queryKey: ['admin-customers-map'] });
    }
  }, [queryClient]);

  useEffect(() => {
    // Первую попытку откладываем на такт: flush меняет состояние, а делать
    // это в теле эффекта — каскад рендеров ещё до первой отрисовки кассы.
    const kick = window.setTimeout(() => void flush(), 0);

    const onOnline = () => void flush();
    window.addEventListener('online', onOnline);
    return () => {
      window.clearTimeout(kick);
      window.removeEventListener('online', onOnline);
    };
  }, [flush]);

  /** Положить чек в очередь — когда отправить прямо сейчас не вышло. */
  const remember = useCallback((sale: QueuedSale) => {
    const next = enqueue(readQueue(), sale);
    writeQueue(next);
    setPending(next.length);
  }, []);

  return { pending, rejected, expired, remember, flush };
}

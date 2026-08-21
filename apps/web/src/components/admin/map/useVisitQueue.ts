'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  dequeue,
  enqueue,
  readQueue,
  splitByAge,
  visitKey,
  writeQueue,
} from '@/lib/customers/visitQueue';

// ══════════════════════════════════════════════════════════════════════
// Отправка отметок, сделанных без связи.
//
// Пробуем в трёх случаях: при открытии карты, при возвращении связи
// (событие `online`) и сразу после новой отметки. Никакого таймера: сеть
// сама говорит, когда появилась, а опрос раз в минуту при мёртвой сети —
// это просто разряженный аккумулятор.
//
// Background Sync не используем: он есть в Chrome и нет в Safari на
// iPhone, а терять отметки у половины телефонов ради красивого API не
// стоит.
// ══════════════════════════════════════════════════════════════════════

export function useVisitQueue() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(0);
  const [expired, setExpired] = useState(0);

  /**
   * Отправить всё, что накопилось.
   *
   * По одной записи и последовательно: пачка из десяти параллельных
   * запросов по возвращении связи — верный способ получить половину
   * отказов на первой же слабой сети.
   */
  const flush = useCallback(async () => {
    // Уступаем такт прежде, чем трогать состояние: flush зовётся из
    // эффекта, а синхронный setState оттуда даёт каскад рендеров. При
    // пустой очереди других await до конца функции не будет.
    await Promise.resolve();

    let queue = readQueue();
    if (queue.length === 0) {
      setPending(0);
      return;
    }

    const { fresh, stale } = splitByAge(queue);
    if (stale.length > 0) {
      // Протухшие убираем из очереди, но говорим о них вслух: молча
      // выброшенная отметка — это поездка, которой как будто не было.
      setExpired((n) => n + stale.length);
      queue = fresh;
      writeQueue(queue);
    }

    let sent = 0;
    for (const item of fresh) {
      try {
        const res = await fetch('/api/admin/customers/visits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: item.customerId,
            type: item.type,
            note: item.note,
            visitedAt: item.visitedAt,
          }),
        });
        // 4xx — запись негодна и в очереди застрянет навсегда: сервер уже
        // сказал, что не примет. Убираем. 5xx и обрыв — повод попробовать
        // позже, поэтому оставляем.
        if (!res.ok && res.status >= 500) break;
        queue = dequeue(queue, item.key);
        writeQueue(queue);
        if (res.ok) sent++;
      } catch {
        // Связи снова нет — остальное подождёт.
        break;
      }
    }

    setPending(queue.length);
    if (sent > 0) {
      queryClient.invalidateQueries({ queryKey: ['admin-customers-map'] });
      queryClient.invalidateQueries({ queryKey: ['admin-customer'] });
    }
  }, [queryClient]);

  useEffect(() => {
    // Первую попытку откладываем на такт: flush меняет состояние, а делать
    // это прямо в теле эффекта значит запустить каскад рендеров ещё до
    // первой отрисовки карты. Задержка нулевая, человек её не замечает.
    const kick = window.setTimeout(() => void flush(), 0);

    const onOnline = () => void flush();
    window.addEventListener('online', onOnline);
    return () => {
      window.clearTimeout(kick);
      window.removeEventListener('online', onOnline);
    };
  }, [flush]);

  /** Положить отметку в очередь — когда отправить прямо сейчас не вышло. */
  const remember = useCallback(
    (visit: { customerId: number; type: string; note: string }) => {
      const visitedAt = Date.now();
      const next = enqueue(readQueue(), {
        key: visitKey(visit.customerId, visitedAt),
        customerId: visit.customerId,
        type: visit.type,
        note: visit.note,
        visitedAt,
      });
      writeQueue(next);
      setPending(next.length);
    },
    [],
  );

  return {
    /** Сколько отметок ждёт связи. */
    pending,
    /** Сколько выброшено по сроку — показываем один раз и не скрываем. */
    expired,
    remember,
    flush,
  };
}

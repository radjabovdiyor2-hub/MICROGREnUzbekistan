'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  dropAction,
  newClientRef,
  pushAction,
  readActions,
  requestFor,
  splitByAge,
  type FieldAction,
} from '@/lib/tracking/stayQueue';

// ══════════════════════════════════════════════════════════════════════
// Отправка полевых действий, сделанных без связи.
//
// Устроено как `useVisitQueue` и по тем же доводам: пробуем при открытии
// карты, при возвращении связи и сразу после действия; таймера нет —
// опрос при мёртвой сети только жжёт аккумулятор.
//
// ОТЛИЧИЕ ОДНО, И ОНО ГЛАВНОЕ: ПОРЯДОК. У визитов записи независимы, и
// неудача одной не мешает остальным. Здесь «уехал» и фото ссылаются на
// стоянку, которой на сервере может ещё не быть, — поэтому на первой же
// осечке останавливаемся целиком, а не перескакиваем к следующей записи.
// ══════════════════════════════════════════════════════════════════════

export function useStayQueue() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(0);
  const [expired, setExpired] = useState(0);

  const flush = useCallback(async () => {
    const all = await readActions();
    if (all.length === 0) {
      setPending(0);
      return;
    }

    const { fresh, stale } = splitByAge(all);
    for (const item of stale) {
      // Протухшее убираем, но говорим вслух: молча выброшенный заезд —
      // это работа, которой как будто не было.
      if (item.id !== undefined) await dropAction(item.id);
    }
    if (stale.length > 0) setExpired((n) => n + stale.length);

    let sent = 0;
    for (const item of fresh) {
      const req = requestFor(item);
      if (!req) {
        if (item.id !== undefined) await dropAction(item.id);
        continue;
      }
      try {
        const res = await fetch(req.url, req.init);
        // 5xx и обрыв — повод попробовать позже. Дальше по очереди НЕ
        // идём: следующая запись почти наверняка ссылается на эту.
        if (!res.ok && res.status >= 500) break;
        // 4xx — сервер уже сказал, что не примет; в очереди такое
        // застрянет навсегда.
        if (item.id !== undefined) await dropAction(item.id);
        if (res.ok) sent += 1;
      } catch {
        break;
      }
    }

    const left = await readActions();
    setPending(left.length);
    if (sent > 0) {
      queryClient.invalidateQueries({ queryKey: ['admin-customers-map'] });
      queryClient.invalidateQueries({ queryKey: ['field-day'] });
    }
  }, [queryClient]);

  useEffect(() => {
    const kick = window.setTimeout(() => void flush(), 0);
    const onOnline = () => void flush();
    window.addEventListener('online', onOnline);
    return () => {
      window.clearTimeout(kick);
      window.removeEventListener('online', onOnline);
    };
  }, [flush]);

  /**
   * Записать действие и попытаться отправить.
   *
   * СНАЧАЛА В ОЧЕРЕДЬ, ПОТОМ ОТПРАВКА — всегда, даже при живой связи.
   * Иначе обрыв посреди запроса теряет действие: отправить не вышло, а
   * записать было негде. Дубля это не создаёт: сервер узнаёт повтор по
   * `clientRef`.
   */
  const remember = useCallback(
    async (action: Omit<FieldAction, 'id'>) => {
      const stored = await pushAction(action);
      if (!stored) {
        // Хранилища нет (приватный режим, старый движок) — пробуем прямо
        // сейчас. Не вышло — потеряем, и об этом скажет вызывающий.
        const req = requestFor(action as FieldAction);
        if (!req) return false;
        const res = await fetch(req.url, req.init);
        return res.ok;
      }
      await flush();
      return true;
    },
    [flush],
  );

  return { pending, expired, remember, flush, newClientRef };
}

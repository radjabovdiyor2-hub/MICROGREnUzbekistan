'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

// ══════════════════════════════════════════════════════════════════════
// Приём изменений с сервера: `/api/events` → инвалидация кэша React Query.
//
// Сервер присылает только имя темы. Что именно перезапросить, решает
// клиент — по таблице ниже. Поэтому экран, который сейчас не открыт,
// ничего не грузит: у его запросов нет активных наблюдателей, и React Query
// пометит их устаревшими, но выполнит только при следующем показе.
//
// ЗАПАСНОЙ ПУТЬ
//
// Если поток не поднялся — корпоративный прокси, режим экономии трафика,
// офлайн, — хук переходит на редкий опрос. Реальное время должно быть
// улучшением, а не единственным способом увидеть свежие данные: иначе
// первая же капризная сеть превращает админку в сводку вчерашнего дня.
// ══════════════════════════════════════════════════════════════════════

/**
 * Какие ключи кэша устаревают от какой темы.
 *
 * Список ведётся вручную и осознанно: инвалидировать всё подряд на каждое
 * событие значило бы заменить тридцатисекундный опрос опросом по любому
 * чиху. Экраны сводки и аналитики стоят дорого — они считают агрегаты, — и
 * попадают сюда только под темы, которые на них реально влияют.
 *
 * Новый экран на React Query → допишите его ключ в подходящую тему. Не
 * дописали — он просто останется на прежнем поведении (обновление при
 * открытии), но не сломается.
 */
const KEYS_BY_TOPIC: Record<string, string[]> = {
  products: [
    'admin-products', 'admin-products-counts', 'admin-products-categories',
    'admin-categories', 'products-list', 'products-for-prices', 'admin-inventory',
  ],
  orders: [
    'admin-orders', 'admin-sales', 'admin-finance', 'admin-debts',
    'admin-stats', 'admin-revenue', 'admin-analytics', 'admin-deliveries',
  ],
  inventory: [
    'admin-inventory', 'admin-movements', 'admin-sales', 'admin-raw-materials',
    'admin-stats', 'admin-forecast', 'admin-analytics',
    'admin-analytics-health', 'admin-analytics-abcxyz',
  ],
  customers: ['admin-customers', 'admin-customer', 'admin-customers-map'],
  tasks: ['admin-tasks', 'admin-approvals', 'admin-department'],
  growing: ['admin-grow-summary', 'admin-grow-batches', 'admin-crop-norms', 'admin-qa'],
  bots: ['admin-bot-health', 'admin-ai-spend'],
};

/** Как часто опрашивать, когда поток недоступен. */
const FALLBACK_MS = 30_000;

/** Сколько неудачных попыток подряд считать отказом канала. */
const MAX_RETRIES = 3;

export type RealtimeState = 'connecting' | 'live' | 'polling';

export function useRealtime(enabled: boolean): RealtimeState {
  const queryClient = useQueryClient();
  // Начальное значение считаем СРАЗУ, а не в эффекте: браузер без
  // `EventSource` живёт опросом с первой отрисовки, и лишний проход
  // рендера ради этого не нужен.
  const [state, setState] = useState<RealtimeState>(() =>
    typeof window === 'undefined' || !('EventSource' in window) ? 'polling' : 'connecting',
  );
  const failures = useRef(0);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !('EventSource' in window)) return;

    let source: EventSource | null = null;
    let fallback: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    const invalidateAll = () => {
      for (const keys of Object.values(KEYS_BY_TOPIC)) {
        for (const key of keys) queryClient.invalidateQueries({ queryKey: [key] });
      }
    };

    const startFallback = () => {
      if (fallback) return;
      setState('polling');
      fallback = setInterval(invalidateAll, FALLBACK_MS);
    };

    const connect = () => {
      if (closed) return;
      source = new EventSource('/api/events');

      source.onopen = () => {
        failures.current = 0;
        if (fallback) {
          clearInterval(fallback);
          fallback = null;
        }
        setState('live');
      };

      source.onmessage = (event: MessageEvent<string>) => {
        try {
          const { topic } = JSON.parse(event.data) as { topic?: string };
          const keys = topic ? KEYS_BY_TOPIC[topic] : undefined;
          if (!keys) return;
          for (const key of keys) queryClient.invalidateQueries({ queryKey: [key] });
        } catch {
          // Кадр не разобрался — пропускаем. Ронять поток из-за одного
          // испорченного сообщения хуже, чем потерять одно обновление.
        }
      };

      source.onerror = () => {
        // `EventSource` переподключается сам, поэтому здесь только счёт
        // неудач: после трёх подряд признаём канал недоступным и живём
        // опросом, не закрывая поток — вдруг сеть вернётся.
        failures.current += 1;
        if (failures.current >= MAX_RETRIES) startFallback();
      };
    };

    connect();

    return () => {
      closed = true;
      source?.close();
      if (fallback) clearInterval(fallback);
    };
  }, [enabled, queryClient]);

  return state;
}

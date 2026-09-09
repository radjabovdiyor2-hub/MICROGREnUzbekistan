'use client';

import { useQuery } from '@tanstack/react-query';

import type { PersonOnMap } from './mapLayersPeople';

// ══════════════════════════════════════════════════════════════════════
// Кто сейчас в поле — для слоя людей на карте клиентов.
//
// ТУМБЛЕРА НЕТ НАМЕРЕННО. Слой сам себя выключает: никто не транслирует —
// людей на карте нет, и показывать нечего. Кнопка «показать сотрудников»
// была бы ещё одним переключателем, который в девяти случаях из десяти
// ничего не меняет, — а карта и так плотная.
//
// ПРОДАВЦУ РОУТ ОТВЕЧАЕТ ОТКАЗОМ, и это правильно: видеть, где сейчас
// коллега, ему незачем. Поэтому не повторяем запрос при отказе — иначе
// карта продавца долбилась бы в закрытую дверь раз в минуту весь день.
// ══════════════════════════════════════════════════════════════════════

/** Раз в минуту — с той же частотой, с какой шлёт Telegram. */
const REFRESH_MS = 60_000;

interface LiveResponse {
  people: {
    id: string;
    name: string;
    silentMin: number | null;
    last: { latitude: number; longitude: number } | null;
    track: { latitude: number; longitude: number }[];
  }[];
}

export function useFieldPeople(): PersonOnMap[] | null {
  const { data } = useQuery<PersonOnMap[] | null>({
    queryKey: ['field-people-layer'],
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
    // Отказ — это ответ, а не сбой связи: повторять его бессмысленно.
    retry: false,
    queryFn: async () => {
      const res = await fetch('/api/admin/tracking/live');
      if (!res.ok) return null;
      const body = (await res.json()) as LiveResponse;
      return Array.isArray(body.people) ? body.people : null;
    },
  });

  return data ?? null;
}

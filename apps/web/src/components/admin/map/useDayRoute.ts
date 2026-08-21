'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';

import {
  DAY_ROUTE_KEY,
  addStop,
  moveStop,
  orderByProximity,
  parseStops,
  removeStop,
  type RoutePoint,
} from '@/lib/customers/dayRoute';

// ══════════════════════════════════════════════════════════════════════
// Объезд на день: состояние и его хранение.
//
// Живёт в localStorage, а не в памяти вкладки: объезд набирают утром, а
// ездят по нему весь день, и перезагрузка страницы в машине не должна
// стирать список. В базу не пишем — это черновик одного человека на
// сегодня, а не общий план доставки (тот в `DeliveryRoute`).
//
// Читается через useSyncExternalStore по той же причине, что и выбор
// навигатора: localStorage на сервере нет, наивный useState развалил бы
// гидратацию, а чтение эффектом даёт каскад рендеров.
// ══════════════════════════════════════════════════════════════════════

const ROUTE_EVENT = 'mg-day-route-changed';
const EMPTY: RoutePoint[] = [];

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(ROUTE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(ROUTE_EVENT, onChange);
  };
}

/**
 * Разобранный список кэшируем по сырой строке.
 *
 * `getSnapshot` обязан возвращать одно и то же значение, пока источник не
 * изменился: свежий массив на каждом вызове уводит React в бесконечную
 * перерисовку. Сравниваем по строке из хранилища — она и есть источник.
 */
let cachedRaw: string | null = null;
let cachedStops: RoutePoint[] = EMPTY;

function snapshot(): RoutePoint[] {
  const raw = window.localStorage.getItem(DAY_ROUTE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedStops = parseStops(raw);
  }
  return cachedStops;
}

export function useDayRoute() {
  const stops = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  // Где человек сейчас — приезжает от кнопки геолокации карты. Без него
  // порядок считается от первой выбранной точки.
  const [from, setFrom] = useState<RoutePoint | null>(null);

  const write = useCallback((next: RoutePoint[]) => {
    window.localStorage.setItem(DAY_ROUTE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(ROUTE_EVENT));
  }, []);

  return {
    stops,
    from,
    setFrom,
    has: (id: number) => stops.some((s) => s.id === id),
    add: (point: RoutePoint) => write(addStop(stops, point)),
    remove: (id: number) => write(removeStop(stops, id)),
    move: (id: number, delta: -1 | 1) => write(moveStop(stops, id, delta)),
    sort: () => write(orderByProximity(stops, from)),
    clear: () => write([]),
  };
}

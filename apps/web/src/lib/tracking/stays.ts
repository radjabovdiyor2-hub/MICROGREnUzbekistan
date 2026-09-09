import { metersBetween } from '@/lib/customers/visitProof';

import type { TrackPingInput } from './ping';

// ══════════════════════════════════════════════════════════════════════
// Из трека — стоянки: у кого был и сколько простоял.
//
// Модуль ЧИСТЫЙ: ни базы, ни часов. Это главная арифметика всей подсистемы
// — именно её числа потом показывают владельцу, — и проверять её надо
// тестами, а не глазами по карте.
//
// ЧТО ЗДЕСЬ СЧИТАЕТСЯ УТВЕРЖДЕНИЕМ. «Простоял сорок минут» — это уже почти
// оценка работы. Поэтому все спорные случаи ниже решены в пользу
// сотрудника: неизвестность толкуется не как прогул. Обратное однажды
// обвинит невиновного, и доверие к признаку пропадёт целиком.
// ══════════════════════════════════════════════════════════════════════

export interface CustomerPin {
  id: number;
  latitude: number;
  longitude: number;
}

export interface DerivedStay {
  customerId: number;
  arrivedAt: Date;
  leftAt: Date;
  dwellSec: number;
  /** Сколько секунд внутри стоянки связь молчала. */
  silentSec: number;
  /** Крошек в стоянке. Одна-две — это касание радиуса, а не визит. */
  pings: number;
}

/**
 * Ближайший клиент в радиусе — или `null`, если человек не у клиента.
 *
 * Ближайший, а не первый попавшийся: в центре Самарканда заведения стоят
 * вплотную, и «первый в радиусе» приписал бы визит соседу по улице.
 */
export function nearestPin(
  at: { latitude: number; longitude: number },
  pins: CustomerPin[],
  radiusM: number,
): CustomerPin | null {
  let best: CustomerPin | null = null;
  let bestM = Infinity;
  for (const pin of pins) {
    const m = metersBetween(at, pin);
    if (m <= radiusM && m < bestM) {
      best = pin;
      bestM = m;
    }
  }
  return best;
}

/**
 * Разрыв связи, после которого стоянка считается прерванной.
 *
 * Час — намеренно много. Внутри часа молчания, когда крошки до и после
 * стоят у ОДНОГО клиента, простейшее объяснение одно: человек никуда не
 * уходил, а телефон потерял сеть в подвале или в железном павильоне.
 * Разрезать здесь значит показать два коротких заезда вместо одного
 * долгого разговора — то есть занизить работу по шуму связи.
 *
 * Дольше часа — уже нельзя утверждать ничего: за час уезжают и
 * возвращаются. Такую стоянку режем, и в отчёте будут две.
 */
export const STAY_BREAK_MS = 60 * 60 * 1000;

/**
 * Стоянки из трека.
 *
 * Крошки должны быть отсортированы по времени (это делает `readPingBatch`).
 *
 * @param minStayMs Короче этого — не стоянка, а светофор у заведения.
 */
export function detectStays(
  pings: TrackPingInput[],
  pins: CustomerPin[],
  radiusM: number,
  minStayMs: number,
): DerivedStay[] {
  const stays: DerivedStay[] = [];
  if (pins.length === 0) return stays;

  let current: { pin: CustomerPin; items: TrackPingInput[]; silentMs: number } | null = null;

  const flush = () => {
    if (!current) return;
    const first = current.items[0];
    const last = current.items[current.items.length - 1];
    const ms = last.at.getTime() - first.at.getTime();
    if (ms >= minStayMs) {
      stays.push({
        customerId: current.pin.id,
        arrivedAt: first.at,
        leftAt: last.at,
        dwellSec: Math.round(ms / 1000),
        silentSec: Math.round(current.silentMs / 1000),
        pings: current.items.length,
      });
    }
    current = null;
  };

  for (const ping of pings) {
    const pin = nearestPin(ping, pins, radiusM);

    if (!pin) {
      // Уехал из радиуса — стоянка закончилась там, где последний раз его
      // видели у клиента, а не здесь.
      flush();
      continue;
    }

    if (current && current.pin.id === pin.id) {
      const gap = ping.at.getTime() - current.items[current.items.length - 1].at.getTime();
      if (gap > STAY_BREAK_MS) {
        // Слишком долго молчал: утверждать, что всё это время он стоял
        // здесь, нельзя. Закрываем прежнюю стоянку и начинаем новую.
        flush();
        current = { pin, items: [ping], silentMs: 0 };
        continue;
      }
      current.items.push(ping);
      // Молчанием считаем только заметные паузы: трансляция шлёт точку раз
      // в минуту, и называть это «связь пропадала» было бы неправдой.
      if (gap > 5 * 60 * 1000) current.silentMs += gap;
      continue;
    }

    // Другой клиент — прежняя стоянка закончилась.
    flush();
    current = { pin, items: [ping], silentMs: 0 };
  }

  flush();
  return stays;
}

/**
 * Плечи между стоянками: сколько ехал от одной до другой по факту.
 *
 * Считаем ТОЛЬКО время и только по стоянкам: длину пути даёт трек, а
 * эталон — маршрутизатор, и оба приходят отдельно. Здесь — костяк, к
 * которому они прикрепляются.
 */
export interface DerivedLeg {
  fromIndex: number;
  toIndex: number;
  departedAt: Date;
  arrivedAt: Date;
  actualSec: number;
}

export function detectLegs(stays: DerivedStay[]): DerivedLeg[] {
  const legs: DerivedLeg[] = [];
  for (let i = 1; i < stays.length; i += 1) {
    const from = stays[i - 1];
    const to = stays[i];
    const sec = Math.round((to.arrivedAt.getTime() - from.leftAt.getTime()) / 1000);
    // Ноль и отрицательное время означают наложение стоянок — такого не
    // бывает у корректного трека, и плечо из этого строить нечего.
    if (sec <= 0) continue;
    legs.push({
      fromIndex: i - 1,
      toIndex: i,
      departedAt: from.leftAt,
      arrivedAt: to.arrivedAt,
      actualSec: sec,
    });
  }
  return legs;
}

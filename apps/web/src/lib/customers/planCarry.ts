// ══════════════════════════════════════════════════════════════════════
// Необъеханное едет на завтра.
//
// ЗАЧЕМ. План собирался на день и на нём же заканчивался: точки, до
// которых не доехали, не переносились никуда и не попадали ни в один
// отчёт. Через неделю «объехать всех» означало «объехать тех, кто вспомнился
// утром», а клиент, пропущенный трижды, выглядел не пропущенным, а
// несуществующим.
//
// ПРАВИЛА ПЕРЕНОСА
//
// 1. Переносится остановка БЕЗ отметки (`interactionId === null`). Именно
//    отметка, а не стоянка: заехать и не застать — это состоявшийся визит
//    с исходом «не застал», и повторять его завтра незачем.
//
// 2. Перенесённые едут ПЕРВЫМИ. Точка, ждущая второй день, не должна
//    проигрывать очередь свежей: иначе она не проиграет её никогда.
//
// 3. Счётчик переносов растёт. Три дня подряд — это уже не «не успели»,
//    а решение, которого никто не принимал вслух.
//
// 4. Есть потолок. Точку, которую не объехали пять раз, перестаём таскать
//    молча: она возвращается владельцу вопросом, а не висит в маршруте
//    вечным упрёком.
// ══════════════════════════════════════════════════════════════════════

/** Дольше этого не переносим: пора решать, а не возить дальше. */
export const CARRY_LIMIT = 5;

export interface CarryCandidate {
  customerId: number;
  /** Сколько раз остановку уже переносили. */
  carriedTimes: number;
  /** Отметка, закрывшая остановку. null — не объехали. */
  interactionId: number | null;
}

export interface PlannedStop {
  customerId: number;
  orderIndex: number;
  origin: 'plan' | 'carry';
  carriedTimes: number;
}

/**
 * Что из вчерашнего переносим на завтра.
 *
 * Исчерпавшие лимит отсекаются здесь же и возвращаются отдельным списком:
 * молча выброшенная точка — это клиент, о котором забыли дважды.
 */
export function splitCarry<T extends CarryCandidate>(stops: T[]): {
  carry: T[];
  exhausted: T[];
} {
  // Обобщение, а не `CarryCandidate[]` на выходе: вызывающий приносит
  // остановки С ИМЕНЕМ И КООРДИНАТАМИ (см. `CarryStop`), а фиксированный
  // тип возврата обрезал бы их — и экран, которому этот список показывать,
  // получал бы на руки одни номера клиентов при живых данных в них.
  const carry: T[] = [];
  const exhausted: T[] = [];

  for (const stop of stops) {
    // Объехали — переносить нечего.
    //
    // `typeof === 'number'` по той же причине, что и в `readDayPlans`:
    // `!== null` объявляет выполненной остановку, у которой поля нет
    // вовсе. Здесь цена ошибки — тихо НЕ перенести невыполненное, то есть
    // потерять клиента из завтрашнего дня.
    if (typeof stop.interactionId === 'number') continue;
    if (stop.carriedTimes >= CARRY_LIMIT) exhausted.push(stop);
    else carry.push(stop);
  }

  return { carry, exhausted };
}

/**
 * Собрать завтрашний порядок объезда.
 *
 * Перенесённые впереди, свежие следом. Дубли убираются по клиенту: точка,
 * оставшаяся со вчера и заодно выпавшая по расписанию, — это одна поездка,
 * а не две.
 *
 * Порядок внутри перенесённых — по числу переносов, от самых залежавшихся:
 * иначе точка, ждущая четвёртый день, снова окажется в конце дня.
 */
export function mergeStops(
  // Не `CarryCandidate`, а ровно то, что здесь читается: кто и сколько раз
  // переезжал. Ссылка на отметку к порядку объезда отношения не имеет —
  // невыполненность уже решена в `splitCarry`, — и требовать её значило бы
  // заставлять экран таскать поле ради проверки, которой тут нет.
  carry: { customerId: number; carriedTimes: number }[],
  fresh: number[],
): PlannedStop[] {
  const out: PlannedStop[] = [];
  const seen = new Set<number>();

  const ordered = [...carry].sort((a, b) => b.carriedTimes - a.carriedTimes);

  for (const stop of ordered) {
    if (seen.has(stop.customerId)) continue;
    seen.add(stop.customerId);
    out.push({
      customerId: stop.customerId,
      orderIndex: out.length,
      origin: 'carry',
      carriedTimes: stop.carriedTimes + 1,
    });
  }

  for (const customerId of fresh) {
    if (seen.has(customerId)) continue;
    seen.add(customerId);
    out.push({ customerId, orderIndex: out.length, origin: 'plan', carriedTimes: 0 });
  }

  return out;
}

/**
 * Сколько остановок плана закрыто.
 *
 * Считается по `interactionId`, а не сопоставлением «клиент + день»:
 * у остановки теперь есть прямая ссылка на отметку, которая её закрыла,
 * и двойной заезд к одному клиенту больше не путает счёт.
 */
export function planProgress(stops: CarryCandidate[]): { done: number; total: number } {
  return {
    done: stops.filter((s) => typeof s.interactionId === 'number').length,
    total: stops.length,
  };
}

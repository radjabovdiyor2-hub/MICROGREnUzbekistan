import { formatLocalDate, startOfLocalDay } from '@/lib/localDate';
import type { Rhythm } from './practices';

// ══════════════════════════════════════════════════════════════════════
// Серии и «пора»: считаются периодами, а не днями между отметками.
//
// ЗАЧЕМ ПЕРИОДЫ. Разница «сколько дней прошло» ломается на месяцах: 30
// дней между отметками — это то один и тот же месяц, то соседние, смотря
// откуда считать. Практика «раз в месяц» должна быть выполнена В МЕСЯЦЕ, а
// не «не позже чем через 30 дней», иначе отметка первого числа закрывает
// сразу два месяца.
//
// ПОЧЕМУ СЕРИЯ НЕ ОБНУЛЯЕТСЯ СЕГОДНЯ. День ещё не кончился. Серия рвётся,
// когда пропущен ПРОШЛЫЙ период, а не когда не отмечен текущий — иначе
// счётчик показывал бы ноль каждое утро и не значил бы ничего.
// ══════════════════════════════════════════════════════════════════════

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Номер периода, в который попадает дата.
 *
 * Числа сравнимы только внутри одного ритма — это порядковый номер, а не
 * величина.
 */
export function periodIndex(date: Date, rhythm: Rhythm): number {
  const day = startOfLocalDay(date);
  switch (rhythm) {
    case 'daily':
      return Math.floor(day.getTime() / DAY_MS);
    case 'weekly':
      // Недели считаются от четверга 1970-01-01, поэтому сдвиг на 4 дня:
      // без него граница недели приходится на середину рабочей.
      return Math.floor((day.getTime() / DAY_MS + 4) / 7);
    case 'monthly':
      return day.getFullYear() * 12 + day.getMonth();
    case 'quarterly':
      return day.getFullYear() * 4 + Math.floor(day.getMonth() / 3);
    default:
      // Разовое и правила периодов не имеют: любая отметка закрывает их.
      return 0;
  }
}

export interface Progress {
  /** Сколько периодов подряд закрыто. */
  streak: number;
  /** Нужно сделать в текущем периоде — ещё не отмечено. */
  due: boolean;
  /** Дата последней отметки, ГГГГ-ММ-ДД. Пусто — не делали ни разу. */
  lastDone: string | null;
  /** Всего отметок за всё время. */
  total: number;
}

/**
 * Посчитать состояние практики по её отметкам.
 *
 * Отметки принимаются в любом порядке и с повторами: один период
 * засчитывается один раз, сколько бы галочек в него ни попало.
 */
export function progressOf(ticks: Date[], rhythm: Rhythm, today: Date): Progress {
  if (ticks.length === 0) {
    return { streak: 0, due: rhythm !== 'principle', lastDone: null, total: 0 };
  }

  const last = ticks.reduce((a, b) => (a > b ? a : b));
  const lastDone = formatLocalDate(startOfLocalDay(last));

  // Разовое сделано навсегда, правило не отмечается по кругу.
  if (rhythm === 'setup' || rhythm === 'principle') {
    return { streak: 0, due: false, lastDone, total: ticks.length };
  }

  const now = periodIndex(today, rhythm);
  const closed = new Set(ticks.map((t) => periodIndex(t, rhythm)));

  // Считаем назад от текущего периода, если он закрыт, иначе от прошлого:
  // текущий ещё можно успеть закрыть, и рвать серию рано.
  let cursor = closed.has(now) ? now : now - 1;
  let streak = 0;
  while (closed.has(cursor)) {
    streak += 1;
    cursor -= 1;
  }

  return { streak, due: !closed.has(now), lastDone, total: ticks.length };
}

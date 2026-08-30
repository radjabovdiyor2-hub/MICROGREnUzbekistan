// ══════════════════════════════════════════════════════════════════════
// Дни недели для расписания заездов.
//
// ПОЧЕМУ ISO, А НЕ `getDay()`. `Date.getDay()` считает воскресенье нулём,
// а понедельник единицей — то есть неделя у него начинается в воскресенье.
// В базе (`VisitSchedule.weekday`) хранится ISO: понедельник 1, воскресенье
// 7. Смешение двух шкал даёт сдвиг ровно на один день и проявляется не
// сразу, а в конкретный день недели — субботний объезд уезжает на пятницу,
// и заметить это можно только в субботу.
//
// Поэтому перевод живёт в ОДНОЙ функции, и её проверяет тест.
// ══════════════════════════════════════════════════════════════════════

/** ISO-день недели: 1 — понедельник, 7 — воскресенье. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

export const WEEKDAY_META: Record<Weekday, { ru: string; uz: string; shortRu: string; shortUz: string }> = {
  1: { ru: 'Понедельник', uz: 'Dushanba', shortRu: 'Пн', shortUz: 'Du' },
  2: { ru: 'Вторник', uz: 'Seshanba', shortRu: 'Вт', shortUz: 'Se' },
  3: { ru: 'Среда', uz: 'Chorshanba', shortRu: 'Ср', shortUz: 'Ch' },
  4: { ru: 'Четверг', uz: 'Payshanba', shortRu: 'Чт', shortUz: 'Pa' },
  5: { ru: 'Пятница', uz: 'Juma', shortRu: 'Пт', shortUz: 'Ju' },
  6: { ru: 'Суббота', uz: 'Shanba', shortRu: 'Сб', shortUz: 'Sh' },
  7: { ru: 'Воскресенье', uz: 'Yakshanba', shortRu: 'Вс', shortUz: 'Ya' },
};

/**
 * ISO-день недели даты.
 *
 * Единственное место, где `getDay()` вообще вызывается: воскресный ноль
 * превращается в семёрку здесь и больше нигде.
 */
export function isoWeekday(date: Date): Weekday {
  const raw = date.getDay();
  return (raw === 0 ? 7 : raw) as Weekday;
}

/** Известен ли номер дня. Чужое число в фильтре — не повод падать. */
export function isWeekday(value: unknown): value is Weekday {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 7;
}

/** Подпись дня на языке интерфейса. */
export function weekdayLabel(day: Weekday, lang: 'ru' | 'uz', short = false): string {
  const meta = WEEKDAY_META[day];
  if (short) return lang === 'ru' ? meta.shortRu : meta.shortUz;
  return lang === 'ru' ? meta.ru : meta.uz;
}

/**
 * Дни расписания одной строкой: «Пн, Ср, Сб».
 *
 * Порядок задаётся неделей, а не порядком записей в базе: расписание
 * читают глазами, и «Сб, Пн, Ср» заставляет пересобирать неделю в уме.
 */
export function weekdaysLabel(days: Weekday[], lang: 'ru' | 'uz'): string {
  return WEEKDAYS.filter((d) => days.includes(d))
    .map((d) => weekdayLabel(d, lang, true))
    .join(', ');
}

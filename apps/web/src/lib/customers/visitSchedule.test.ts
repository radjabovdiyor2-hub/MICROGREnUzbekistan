import { describe, expect, it } from 'vitest';

import { isoWeekday, isWeekday, weekdayLabel, weekdaysLabel, WEEKDAYS } from './visitSchedule';

// ══════════════════════════════════════════════════════════════════════
// Сдвиг на один день — самая тихая ошибка в расписании.
//
// `Date.getDay()` считает воскресенье нулём, база хранит ISO (пн = 1).
// Перепутать их — значит увести субботний объезд на пятницу; заметно это
// становится в субботу, когда продавец уже уехал не туда.
// ══════════════════════════════════════════════════════════════════════

describe('день недели', () => {
  it('понедельник — 1, воскресенье — 7', () => {
    // 2026-08-31 — понедельник, 2026-09-06 — воскресенье.
    expect(isoWeekday(new Date('2026-08-31T12:00:00'))).toBe(1);
    expect(isoWeekday(new Date('2026-09-06T12:00:00'))).toBe(7);
  });

  it('суббота — 6, и это тот самый день из «заезжать по субботам»', () => {
    expect(isoWeekday(new Date('2026-09-05T12:00:00'))).toBe(6);
  });

  it('вся неделя разбирается без пропусков и повторов', () => {
    // Семь дней подряд от понедельника 31.08.2026 обязаны дать 1..7.
    const days = [0, 1, 2, 3, 4, 5, 6].map((shift) =>
      isoWeekday(new Date(2026, 7, 31 + shift, 12)),
    );
    expect(days).toEqual(WEEKDAYS);
  });

  it('чужое значение днём недели не считается', () => {
    expect(isWeekday(0)).toBe(false);
    expect(isWeekday(8)).toBe(false);
    expect(isWeekday('6')).toBe(false);
    expect(isWeekday(6)).toBe(true);
  });

  it('подписи есть на обоих языках, короткие и полные', () => {
    expect(weekdayLabel(6, 'ru')).toBe('Суббота');
    expect(weekdayLabel(6, 'uz')).toBe('Shanba');
    expect(weekdayLabel(6, 'ru', true)).toBe('Сб');
  });

  it('строка расписания идёт по неделе, а не по порядку записей', () => {
    expect(weekdaysLabel([6, 1, 3], 'ru')).toBe('Пн, Ср, Сб');
  });
});

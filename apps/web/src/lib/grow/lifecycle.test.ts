import { describe, it, expect } from 'vitest';

import { addDays, daysApart, growView, type GrowSpec } from './lifecycle';

// ══════════════════════════════════════════════════════════════════════
// Жизнь лотка глазами клиента.
//
// Проверяется то, что ломается молча и читается каждое утро: номер дня,
// доля пути и момент перехода между фазами. Ошибка на один день здесь —
// это «сегодня готов» вместо «завтра», то есть человек приедет зря.
// ══════════════════════════════════════════════════════════════════════

/** Редис: три дня в темноте, восемь на свету, пять хранения. */
const RADISH: GrowSpec = { seedDate: '2026-08-10', darkDays: 3, lightDays: 8, shelfDays: 5 };

describe('daysApart', () => {
  it('считает календарные дни, а не миллисекунды', () => {
    expect(daysApart('2026-08-10', '2026-08-14')).toBe(4);
    expect(daysApart('2026-08-14', '2026-08-10')).toBe(-4);
    expect(daysApart('2026-08-10', '2026-08-10')).toBe(0);
  });

  // Переход через месяц и через конец года — там, где наивная арифметика
  // «прибавить 30» и ошибается.
  it('переживает границы месяца и года', () => {
    expect(daysApart('2026-08-30', '2026-09-02')).toBe(3);
    expect(daysApart('2026-12-30', '2027-01-02')).toBe(3);
  });

  it('мусор на входе не роняет расчёт', () => {
    expect(daysApart('не дата', '2026-08-10')).toBe(0);
  });
});

describe('addDays', () => {
  it('прибавляет по календарю', () => {
    expect(addDays('2026-08-10', 11)).toBe('2026-08-21');
    expect(addDays('2026-08-30', 3)).toBe('2026-09-02');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });
});

describe('growView — фазы', () => {
  it('день посева — ПЕРВЫЙ день, а не нулевой', () => {
    const v = growView(RADISH, '2026-08-10');
    expect(v.day).toBe(1);
    expect(v.phase).toBe('dark');
  });

  it('в темноте, пока не вышли три дня', () => {
    expect(growView(RADISH, '2026-08-12').phase).toBe('dark');
  });

  // Граница фазы: на третий день после посева темнота кончается. Ошибка
  // здесь сдвигает всю оставшуюся историю на день.
  it('ровно на границе уходит на свет, а не остаётся в темноте', () => {
    const v = growView(RADISH, '2026-08-13');
    expect(v.phase).toBe('light');
    expect(v.day).toBe(4);
  });

  it('готов ровно в свою дату', () => {
    const v = growView(RADISH, '2026-08-21');
    expect(v.phase).toBe('ready');
    expect(v.readyDate).toBe('2026-08-21');
  });

  it('после срока хранения — уже не готов, а упущен', () => {
    expect(growView(RADISH, '2026-08-25').phase).toBe('ready');
    expect(growView(RADISH, '2026-08-26').phase).toBe('past');
  });

  // Клиент выбрал культуру, посадка ближайшая. Это нормальное состояние
  // подписки, а не ошибка данных.
  it('посев в будущем — партия запланирована, а не сломана', () => {
    const v = growView(RADISH, '2026-08-08');
    expect(v.phase).toBe('planned');
    expect(v.day).toBe(0);
    expect(v.next).toBe('sowing');
    expect(v.daysToNext).toBe(2);
  });

  it('срезано — конец истории независимо от дат', () => {
    const v = growView({ ...RADISH, harvested: true }, '2026-08-15');
    expect(v.phase).toBe('harvested');
    expect(v.percent).toBe(100);
    expect(v.next).toBeNull();
  });
});

describe('growView — доля пути', () => {
  // Главное отличие от гроверской getBatchStatus: путь клиента кончается
  // ГОТОВНОСТЬЮ. Считать до конца хранения значит показать человеку, что
  // его почти готовый лоток пройден чуть больше чем наполовину.
  it('считается до готовности, а не до конца хранения', () => {
    // День 9 из 11. До хранения включительно было бы 8/16 = 50 %.
    const v = growView(RADISH, '2026-08-18');
    expect(v.totalDays).toBe(11);
    expect(v.percent).toBe(73);
  });

  it('в день посева — ноль, в день готовности — сто', () => {
    expect(growView(RADISH, '2026-08-10').percent).toBe(0);
    expect(growView(RADISH, '2026-08-21').percent).toBe(100);
  });

  it('за готовностью не уходит выше ста', () => {
    expect(growView(RADISH, '2026-08-24').percent).toBe(100);
  });

  it('вырожденная норма культуры не делит на ноль', () => {
    const v = growView({ seedDate: '2026-08-10', darkDays: 0, lightDays: 0, shelfDays: 2 }, '2026-08-10');
    expect(Number.isFinite(v.percent)).toBe(true);
    expect(v.totalDays).toBe(1);
  });
});

describe('growView — что дальше', () => {
  it('в темноте ждём свет и знаем, через сколько', () => {
    const v = growView(RADISH, '2026-08-11');
    expect(v.next).toBe('light');
    expect(v.daysToNext).toBe(2);
  });

  it('на свету ждём готовность', () => {
    const v = growView(RADISH, '2026-08-19');
    expect(v.next).toBe('ready');
    expect(v.daysToNext).toBe(2);
  });

  // «Осталось столько-то дней забрать» — единственное место, где срок
  // хранения вообще касается клиента.
  it('готовый лоток говорит, сколько ещё ждёт', () => {
    const v = growView(RADISH, '2026-08-23');
    expect(v.next).toBe('pickup');
    expect(v.daysToNext).toBe(3);
  });

  it('упущенный лоток ничего больше не обещает', () => {
    expect(growView(RADISH, '2026-08-27').next).toBeNull();
  });
});

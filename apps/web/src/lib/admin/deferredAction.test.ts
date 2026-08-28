import { describe, expect, it } from 'vitest';

import { deferAction, type Timers } from './deferredAction';

// ══════════════════════════════════════════════════════════════════════
// Отложенное удаление: исход ровно один.
//
// «Выполнено», «отменено» и «доведено при уходе с экрана» — три исхода, и
// случиться должен один. Два подряд означают либо удаление ПОСЛЕ нажатия
// «Отменить», либо удаление дважды: первое — обман, второе — ошибка на
// данных.
//
// Здесь проверяется именно это свойство, а не оформление тоста.
// ══════════════════════════════════════════════════════════════════════

/** Ручные таймеры: время двигаем сами, секунд не ждём. */
function manualTimers() {
  const jobs = new Map<number, () => void>();
  let next = 1;

  const timers: Timers = {
    set: (fn) => {
      const id = next++;
      jobs.set(id, fn);
      return id;
    },
    clear: (id) => void jobs.delete(id),
  };

  return {
    timers,
    /** Время вышло: выполнить всё, что осталось запланированным. */
    fire: () => {
      for (const fn of Array.from(jobs.values())) fn();
      jobs.clear();
    },
    scheduled: () => jobs.size,
  };
}

describe('отложенное действие', () => {
  it('выполняется, когда время вышло', () => {
    const clock = manualTimers();
    const runs: string[] = [];

    deferAction(() => runs.push('удалено'), { delayMs: 6000, timers: clock.timers });

    expect(runs).toEqual([]);
    clock.fire();
    expect(runs).toEqual(['удалено']);
  });

  it('отменённое не выполняется никогда', () => {
    const clock = manualTimers();
    const runs: string[] = [];
    let cancelled = 0;

    const task = deferAction(() => runs.push('удалено'), {
      delayMs: 6000,
      timers: clock.timers,
      onCancelled: () => (cancelled += 1),
    });

    task.cancel();
    clock.fire();

    expect(runs).toEqual([]);
    expect(cancelled).toBe(1);
    expect(clock.scheduled()).toBe(0);
  });

  it('уход с экрана доводит действие до конца', () => {
    const clock = manualTimers();
    const runs: string[] = [];

    const task = deferAction(() => runs.push('удалено'), {
      delayMs: 6000,
      timers: clock.timers,
    });
    task.flush();

    expect(runs).toEqual(['удалено']);
    // Запланированного не осталось: иначе оно выполнилось бы вторым разом.
    expect(clock.scheduled()).toBe(0);
  });

  it('отмена ПОСЛЕ выполнения ничего не меняет', () => {
    const clock = manualTimers();
    const runs: string[] = [];
    let cancelled = 0;

    const task = deferAction(() => runs.push('удалено'), {
      delayMs: 6000,
      timers: clock.timers,
      onCancelled: () => (cancelled += 1),
    });

    clock.fire();
    task.cancel();

    expect(runs).toEqual(['удалено']);
    // Ложное «Отменено» на уже удалённом — прямой обман.
    expect(cancelled).toBe(0);
  });

  it('двойной flush выполняет действие один раз', () => {
    const clock = manualTimers();
    const runs: string[] = [];

    const task = deferAction(() => runs.push('удалено'), {
      delayMs: 6000,
      timers: clock.timers,
    });
    task.flush();
    task.flush();

    expect(runs).toEqual(['удалено']);
  });

  it('после отмены flush не выполняет действие', () => {
    const clock = manualTimers();
    const runs: string[] = [];

    const task = deferAction(() => runs.push('удалено'), {
      delayMs: 6000,
      timers: clock.timers,
    });
    task.cancel();
    task.flush();

    expect(runs).toEqual([]);
  });

  it('`settled` показывает, решено ли уже', () => {
    const clock = manualTimers();
    const task = deferAction(() => {}, { delayMs: 6000, timers: clock.timers });

    expect(task.settled()).toBe(false);
    task.cancel();
    expect(task.settled()).toBe(true);
  });

  it('onDone зовётся один раз и только при выполнении', () => {
    const clock = manualTimers();
    let done = 0;

    const task = deferAction(() => {}, {
      delayMs: 6000,
      timers: clock.timers,
      onDone: () => (done += 1),
    });

    clock.fire();
    task.flush();

    expect(done).toBe(1);
  });
});

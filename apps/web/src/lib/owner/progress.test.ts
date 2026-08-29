import { describe, it, expect } from 'vitest';
import { progressOf, periodIndex } from './progress';

const TODAY = new Date('2026-08-28T15:00:00');
const DAY = 24 * 60 * 60 * 1000;
const ago = (d: number) => new Date(TODAY.getTime() - d * DAY);

describe('серия практики', () => {
  it('три дня подряд — серия три', () => {
    const p = progressOf([ago(0), ago(1), ago(2)], 'daily', TODAY);
    expect(p.streak).toBe(3);
    expect(p.due).toBe(false);
  });

  it('не отмеченный сегодня день серию не рвёт — день ещё не кончился', () => {
    // Иначе счётчик показывал бы ноль каждое утро и не значил бы ничего.
    const p = progressOf([ago(1), ago(2), ago(3)], 'daily', TODAY);
    expect(p.streak).toBe(3);
    expect(p.due).toBe(true);
  });

  it('пропущенный вчерашний день серию рвёт', () => {
    const p = progressOf([ago(2), ago(3)], 'daily', TODAY);
    expect(p.streak).toBe(0);
    expect(p.due).toBe(true);
  });

  it('две отметки в один день считаются за один', () => {
    const p = progressOf(
      [new Date('2026-08-28T09:00:00'), new Date('2026-08-28T20:00:00'), ago(1)],
      'daily',
      TODAY,
    );
    expect(p.streak).toBe(2);
    expect(p.total).toBe(3);
  });

  it('ни разу не делали — сразу «пора»', () => {
    const p = progressOf([], 'daily', TODAY);
    expect(p.due).toBe(true);
    expect(p.lastDone).toBeNull();
  });

  it('порядок отметок не важен', () => {
    const shuffled = progressOf([ago(2), ago(0), ago(1)], 'daily', TODAY);
    expect(shuffled.streak).toBe(3);
  });
});

describe('месячный ритм', () => {
  it('отметка первого числа не закрывает соседний месяц', () => {
    // «Раз в месяц» — это В МЕСЯЦЕ, а не «не позже чем через 30 дней».
    // Считая днями, отметка 1 августа закрывала бы и конец июля.
    const july = periodIndex(new Date('2026-07-31T12:00:00'), 'monthly');
    const august = periodIndex(new Date('2026-08-01T12:00:00'), 'monthly');
    expect(august).toBe(july + 1);
  });

  it('серия по месяцам считается месяцами', () => {
    const p = progressOf(
      [
        new Date('2026-08-05T12:00:00'),
        new Date('2026-07-20T12:00:00'),
        new Date('2026-06-02T12:00:00'),
      ],
      'monthly',
      TODAY,
    );
    expect(p.streak).toBe(3);
    expect(p.due).toBe(false);
  });
});

describe('квартальный ритм', () => {
  it('соседние кварталы различаются', () => {
    const q1 = periodIndex(new Date('2026-03-31T12:00:00'), 'quarterly');
    const q2 = periodIndex(new Date('2026-04-01T12:00:00'), 'quarterly');
    expect(q2).toBe(q1 + 1);
  });
});

describe('разовое и правила', () => {
  it('разовое, однажды сделанное, больше не «пора»', () => {
    const p = progressOf([ago(400)], 'setup', TODAY);
    expect(p.due).toBe(false);
    expect(p.lastDone).not.toBeNull();
  });

  it('несделанное разовое — «пора», сколько бы ни ждало', () => {
    const p = progressOf([], 'setup', TODAY);
    expect(p.due).toBe(true);
  });

  it('правило не бывает «пора» — его помнят, а не отмечают', () => {
    // Превратить правило в галочку значит получить список, который не
    // выполняется целиком ни в один день.
    expect(progressOf([], 'principle', TODAY).due).toBe(false);
    expect(progressOf([ago(1)], 'principle', TODAY).due).toBe(false);
  });
});

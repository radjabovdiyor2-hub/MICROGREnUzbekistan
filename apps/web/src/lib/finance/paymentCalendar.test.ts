import { describe, it, expect } from 'vitest';
import { buildPaymentCalendar, type DebtLike } from './paymentCalendar';

const TODAY = new Date('2026-08-20T09:00:00');

function debt(p: Partial<DebtLike> = {}): DebtLike {
  return {
    id: 'd1',
    type: 'WE_OWE',
    personName: 'Поставщик семян',
    amount: 100_000,
    paidAmount: 0,
    dueDate: new Date('2026-08-25T00:00:00'),
    isPaid: false,
    ...p,
  };
}

describe('buildPaymentCalendar', () => {
  it('разносит долги по дням и считает сальдо нарастающим', () => {
    const c = buildPaymentCalendar(
      [
        debt({ id: 'in', type: 'WHO_OWES_US', amount: 300_000, dueDate: new Date('2026-08-22T00:00:00') }),
        debt({ id: 'out', type: 'WE_OWE', amount: 500_000, dueDate: new Date('2026-08-25T00:00:00') }),
      ],
      TODAY,
    );

    expect(c.days.map((d) => d.date)).toEqual(['2026-08-22', '2026-08-25']);
    expect(c.days[0].balance).toBe(300_000);
    expect(c.days[1].net).toBe(-500_000);
    expect(c.days[1].balance).toBe(-200_000);
  });

  // Ради этого числа календарь и строится: показать разрыв заранее.
  it('показывает худшее сальдо за период', () => {
    const c = buildPaymentCalendar(
      [
        debt({ id: 'out', type: 'WE_OWE', amount: 800_000, dueDate: new Date('2026-08-22T00:00:00') }),
        debt({ id: 'in', type: 'WHO_OWES_US', amount: 900_000, dueDate: new Date('2026-08-28T00:00:00') }),
      ],
      TODAY,
    );

    expect(c.worstBalance).toBe(-800_000);
    // Итог периода положительный — и именно поэтому одного итога мало.
    expect(c.days[c.days.length - 1].balance).toBe(100_000);
  });

  it('считает остаток долга, а не исходную сумму', () => {
    const c = buildPaymentCalendar([debt({ amount: 100_000, paidAmount: 70_000 })], TODAY);
    expect(c.days[0].outgoing).toBe(30_000);
  });

  // Просроченное платится из сегодняшних денег: оставить его в прошлом
  // значило бы показать today как свободный день.
  it('собирает просроченное на сегодня, а не в прошлых датах', () => {
    const c = buildPaymentCalendar(
      [debt({ type: 'WE_OWE', amount: 40_000, dueDate: new Date('2026-08-10T00:00:00') })],
      TODAY,
    );

    expect(c.days).toHaveLength(1);
    expect(c.days[0].date).toBe('2026-08-20');
    expect(c.days[0].items[0].overdue).toBe(true);
    expect(c.overdueOutgoing).toBe(40_000);
  });

  it('различает просроченное к получению и к уплате', () => {
    const c = buildPaymentCalendar(
      [
        debt({ id: 'a', type: 'WHO_OWES_US', amount: 15_000, dueDate: new Date('2026-08-01T00:00:00') }),
        debt({ id: 'b', type: 'WE_OWE', amount: 25_000, dueDate: new Date('2026-08-02T00:00:00') }),
      ],
      TODAY,
    );

    expect(c.overdueIncoming).toBe(15_000);
    expect(c.overdueOutgoing).toBe(25_000);
  });

  // Выбросить бессрочные значило бы показать календарь, который не сходится
  // с общей суммой обязательств.
  it('не теряет долги без проставленного срока', () => {
    const c = buildPaymentCalendar([debt({ id: 'no-date', dueDate: null, amount: 60_000 })], TODAY);

    expect(c.days).toHaveLength(0);
    expect(c.undated).toHaveLength(1);
    expect(c.undated[0].remaining).toBe(60_000);
  });

  it('не показывает закрытые и полностью погашенные долги', () => {
    const c = buildPaymentCalendar(
      [
        debt({ id: 'paid', isPaid: true }),
        debt({ id: 'covered', amount: 50_000, paidAmount: 50_000 }),
      ],
      TODAY,
    );

    expect(c.days).toHaveLength(0);
    expect(c.undated).toHaveLength(0);
  });

  it('складывает несколько долгов одного дня', () => {
    const due = new Date('2026-08-25T00:00:00');
    const c = buildPaymentCalendar(
      [debt({ id: 'a', amount: 10_000, dueDate: due }), debt({ id: 'b', amount: 15_000, dueDate: due })],
      TODAY,
    );

    expect(c.days).toHaveLength(1);
    expect(c.days[0].outgoing).toBe(25_000);
    expect(c.days[0].items).toHaveLength(2);
  });

  it('на пустом списке отдаёт пустой календарь, а не падает', () => {
    const c = buildPaymentCalendar([], TODAY);
    expect(c.days).toEqual([]);
    expect(c.worstBalance).toBe(0);
  });
});

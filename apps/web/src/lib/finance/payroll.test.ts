import { describe, it, expect } from 'vitest';

import {
  buildPayroll,
  paydayOf,
  payrollObligations,
  type EmployeeLike,
  type PayoutLike,
} from './payroll';

const TODAY = new Date('2026-09-01T09:00:00');

function emp(p: Partial<EmployeeLike> = {}): EmployeeLike {
  return { id: 'e1', name: 'Азиз', isActive: true, baseSalary: 4_000_000, shiftRate: null, ...p };
}

function payout(p: Partial<PayoutLike> = {}): PayoutLike {
  return {
    id: 'p1',
    employeeId: 'e1',
    amount: 1_000_000,
    kind: 'ADVANCE',
    period: new Date('2026-09-14T00:00:00'),
    ...p,
  };
}

describe('buildPayroll', () => {
  it('вычитает аванс из оклада и оставляет остаток к выплате', () => {
    const r = buildPayroll([emp()], [payout()], '2026-09', TODAY, 5).rows[0];

    expect(r.base).toBe(4_000_000);
    expect(r.advances).toBe(1_000_000);
    expect(r.paidTotal).toBe(1_000_000);
    expect(r.remaining).toBe(3_000_000);
    expect(r.overpaid).toBe(false);
  });

  it('премия увеличивает начисленное, удержание уменьшает', () => {
    const r = buildPayroll(
      [emp()],
      [
        payout({ id: 'b', kind: 'BONUS', amount: 500_000 }),
        payout({ id: 'd', kind: 'DEDUCTION', amount: 200_000 }),
      ],
      '2026-09',
      TODAY,
      5,
    ).rows[0];

    expect(r.accrued).toBe(4_300_000);
    expect(r.paidTotal).toBe(0); // премия начислена, но не выдана
    expect(r.remaining).toBe(4_300_000);
  });

  it('видит переплату, когда выдали больше начисленного', () => {
    const r = buildPayroll(
      [emp({ baseSalary: 1_000_000 })],
      [payout({ amount: 1_500_000 })],
      '2026-09',
      TODAY,
      5,
    ).rows[0];

    expect(r.remaining).toBe(-500_000);
    expect(r.overpaid).toBe(true);
  });

  it('чужая переплата не уменьшает того, что нужно найти к выплате', () => {
    const p = buildPayroll(
      [emp({ id: 'a', name: 'Азиз', baseSalary: 1_000_000 }), emp({ id: 'b', name: 'Бек' })],
      [payout({ employeeId: 'a', amount: 1_500_000 })],
      '2026-09',
      TODAY,
      5,
    );

    // Азизу переплатили 500 000, Беку должны 4 000 000.
    expect(p.totalRemaining).toBe(4_000_000);
  });

  it('берёт только выплаты своего периода', () => {
    const p = buildPayroll(
      [emp()],
      [payout({ period: new Date('2026-08-20T00:00:00') })],
      '2026-09',
      TODAY,
      5,
    );

    expect(p.rows[0].advances).toBe(0);
    expect(p.rows[0].remaining).toBe(4_000_000);
  });

  it('показывает уволенного, если в периоде были движения', () => {
    const p = buildPayroll(
      [emp({ id: 'gone', name: 'Ушёл', isActive: false })],
      [payout({ employeeId: 'gone' })],
      '2026-09',
      TODAY,
      5,
    );

    expect(p.rows).toHaveLength(1);
    expect(p.rows[0].name).toBe('Ушёл');
  });

  it('прячет уволенного без движений', () => {
    const p = buildPayroll([emp({ isActive: false })], [], '2026-09', TODAY, 5);
    expect(p.rows).toHaveLength(0);
  });

  it('сотрудник без оклада не ломает расчёт', () => {
    const r = buildPayroll([emp({ baseSalary: null })], [], '2026-09', TODAY, 5).rows[0];
    expect(r.base).toBe(0);
    expect(r.remaining).toBe(0);
  });

  it('считает, сколько дней осталось до выплаты', () => {
    const p = buildPayroll([emp()], [], '2026-09', TODAY, 5);
    expect(p.payday).toBe('2026-09-05');
    expect(p.daysToPayday).toBe(4);
  });

  it('первым в списке идёт тот, кому должны больше', () => {
    const p = buildPayroll(
      [emp({ id: 'a', name: 'Азиз', baseSalary: 1_000_000 }), emp({ id: 'b', name: 'Бек', baseSalary: 5_000_000 })],
      [],
      '2026-09',
      TODAY,
      5,
    );

    expect(p.rows.map((r) => r.name)).toEqual(['Бек', 'Азиз']);
  });
});

describe('paydayOf', () => {
  it('сдвигает выплату на последний день месяца, а не в следующий', () => {
    // В феврале 2026 года 28 дней, а день выплаты назначен на 30-е.
    expect(paydayOf('2026-02', 30).getDate()).toBe(28);
    expect(paydayOf('2026-02', 30).getMonth()).toBe(1);
  });
});

describe('payrollObligations', () => {
  it('отдаёт остаток каждого сотрудника отдельной строкой на дату выплаты', () => {
    const p = buildPayroll(
      [emp({ id: 'a', name: 'Азиз' }), emp({ id: 'b', name: 'Бек' })],
      [payout({ employeeId: 'a', amount: 4_000_000, kind: 'SALARY' })],
      '2026-09',
      TODAY,
      5,
    );
    const items = payrollObligations(p);

    // Азизу выплачено полностью — его в календаре быть не должно.
    expect(items).toHaveLength(1);
    expect(items[0].personName).toBe('Бек');
    expect(items[0].amount).toBe(4_000_000);
    expect(items[0].type).toBe('WE_OWE');
    expect(items[0].critical).toBe(true);
    expect(items[0].dueDate?.getDate()).toBe(5);
  });

  it('переплата не превращается в обязательство', () => {
    const p = buildPayroll(
      [emp({ baseSalary: 1_000_000 })],
      [payout({ amount: 1_500_000 })],
      '2026-09',
      TODAY,
      5,
    );

    expect(payrollObligations(p)).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// НАЧИСЛЕНИЕ ПО СМЕНАМ И ПУТЬ ДО КАЛЕНДАРЯ ПЛАТЕЖЕЙ.
//
// Второе — разрыв, которого никто не проверял. `payrollObligations`
// отдаёт только строки с долгом перед сотрудником; пока оклад невозможно
// было ввести, таких строк не было ни одной, и календарь получал пустоту.
// При этом в коде записано, что крупнейший регулярный платёж теперь
// виден в прогнозе. Утверждение было верным по замыслу и ложным на деле,
// и падать было нечему.
// ══════════════════════════════════════════════════════════════════════

describe('начисление по сменам', () => {
  it('полевой сотрудник получает за отработанные дни', () => {
    const payroll = buildPayroll(
      [emp({ baseSalary: null, shiftRate: 150_000 })],
      [],
      '2026-09',
      TODAY,
      30,
      new Map([['e1', 12]]),
    );
    expect(payroll.rows[0].base).toBe(1_800_000);
    expect(payroll.rows[0].shiftDays).toBe(12);
    expect(payroll.rows[0].shiftRate).toBe(150_000);
  });

  it('ни одной смены — ноль, а не ставка', () => {
    const payroll = buildPayroll(
      [emp({ baseSalary: null, shiftRate: 150_000 })],
      [],
      '2026-09',
      TODAY,
      30,
      new Map(),
    );
    expect(payroll.rows[0].base).toBe(0);
  });

  it('оклад не зависит от смен', () => {
    // Офисный сотрудник смен не отмечает, и это не повод не платить ему.
    const payroll = buildPayroll([emp()], [], '2026-09', TODAY, 30, new Map());
    expect(payroll.rows[0].base).toBe(4_000_000);
  });

  it('заданы оба — спор виден, суммы не складываются', () => {
    const payroll = buildPayroll(
      [emp({ baseSalary: 4_000_000, shiftRate: 150_000 })],
      [],
      '2026-09',
      TODAY,
      30,
      new Map([['e1', 12]]),
    );
    expect(payroll.rows[0].rateConflict).toBe(true);
    expect(payroll.rows[0].base).toBe(4_000_000);
  });
});

describe('зарплата доходит до календаря платежей', () => {
  it('начисленное и невыплаченное становится обязательством', () => {
    const payroll = buildPayroll([emp()], [], '2026-09', TODAY, 30, new Map());
    const debts = payrollObligations(payroll);
    expect(debts).toHaveLength(1);
    expect(debts[0].amount).toBe(4_000_000);
    expect(debts[0].critical).toBe(true);
  });

  it('смены полевого сотрудника ТОЖЕ доходят до календаря', () => {
    // Ради этого весь расчёт и заводился: без смен у полевых начисление
    // равнялось нулю, и прогноз кассового разрыва их не видел вовсе.
    const payroll = buildPayroll(
      [emp({ baseSalary: null, shiftRate: 150_000 })],
      [],
      '2026-09',
      TODAY,
      30,
      new Map([['e1', 20]]),
    );
    expect(payrollObligations(payroll)[0].amount).toBe(3_000_000);
  });

  it('всё выплачено — обязательства нет', () => {
    const payroll = buildPayroll(
      [emp()],
      [payout({ kind: 'SALARY', amount: 4_000_000 })],
      '2026-09',
      TODAY,
      30,
      new Map(),
    );
    expect(payrollObligations(payroll)).toEqual([]);
  });
});

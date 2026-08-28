import { describe, it, expect } from 'vitest';
import { CUSTOMER_STATUSES, isCustomerStatus, summarizeFunnel } from './statuses';

describe('isCustomerStatus', () => {
  it('пропускает свои статусы', () => {
    for (const s of CUSTOMER_STATUSES) expect(isCustomerStatus(s)).toBe(true);
  });

  // Ради этого проверка и заведена: чужое слово создавало этап, которого нет
  // ни в одном фильтре, и карточка выпадала из списков молча.
  it('не пропускает чужое, пустое и не-строку', () => {
    expect(isCustomerStatus('regular')).toBe(false);
    expect(isCustomerStatus('LEAD')).toBe(false);
    expect(isCustomerStatus('')).toBe(false);
    expect(isCustomerStatus(undefined)).toBe(false);
    expect(isCustomerStatus(3)).toBe(false);
  });

  // Словарь общий с офисом (apps/tgas/shared/customer_repo.py). Тест
  // краснеет, если кто-то добавит этап только на одной стороне.
  it('держит словарь неизменным без осознанной правки обеих сторон', () => {
    expect([...CUSTOMER_STATUSES]).toEqual(['lead', 'active', 'vip']);
  });
});

describe('summarizeFunnel', () => {
  it('считает доли и переходы между этапами', () => {
    const f = summarizeFunnel({ lead: 100, active: 40, vip: 10 });

    expect(f.map((s) => s.count)).toEqual([100, 40, 10]);
    expect(f[0].share).toBeCloseTo(100 / 150, 10);
    expect(f[1].conversion).toBeCloseTo(0.4, 10);
    expect(f[2].conversion).toBeCloseTo(0.25, 10);
  });

  // У первого этапа перехода не существует. Ноль тут читался бы как
  // «никто не дошёл», а это другой и вполне тревожный ответ.
  it('у первого этапа перехода нет, а не ноль', () => {
    const f = summarizeFunnel({ lead: 10, active: 5, vip: 1 });
    expect(f[0].conversion).toBeNull();
  });

  it('нулевой переход показывает нулём — это диагноз, а не пустота', () => {
    const f = summarizeFunnel({ lead: 50, active: 0, vip: 0 });
    expect(f[1].conversion).toBe(0);
  });

  it('на пустой базе не делит на ноль', () => {
    const f = summarizeFunnel({});
    expect(f.every((s) => s.count === 0 && s.share === 0)).toBe(true);
  });

  it('игнорирует посторонние статусы из базы', () => {
    const f = summarizeFunnel({ lead: 5, мусор: 99 });
    expect(f.reduce((sum, s) => sum + s.count, 0)).toBe(5);
  });
});

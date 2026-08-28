import { describe, it, expect } from 'vitest';
import { collectBreaches, defectShare, largestClientShare } from './thresholds';
import type { MarginRow } from '@/lib/finance/margin';

function row(key: string, revenue: number, label = key): MarginRow {
  return { key, label, revenue, cost: 0, margin: revenue, marginRate: 1, quantity: 1 };
}

describe('largestClientShare', () => {
  it('находит крупнейшее заведение и его долю', () => {
    const r = largestClientShare([row('1', 700_000, 'Плов-центр'), row('2', 300_000, 'Кафе')]);
    expect(r?.label).toBe('Плов-центр');
    expect(r?.share).toBeCloseTo(0.7, 10);
  });

  // Розница — это множество разных людей. Считать её «одним клиентом»
  // значило бы поднимать тревогу о зависимости, которой нет.
  it('не считает розницу крупнейшим клиентом', () => {
    const r = largestClientShare([row('unknown', 900_000, 'Розница'), row('1', 100_000, 'Кафе')]);
    expect(r?.label).toBe('Кафе');
  });

  // Но в знаменателе розница остаётся: если прилавок даёт половину
  // оборота, ни одно заведение не опасно, и завышать его долю нельзя.
  it('делит на всю выручку, включая розницу', () => {
    const r = largestClientShare([row('unknown', 800_000, 'Розница'), row('1', 200_000, 'Кафе')]);
    expect(r?.share).toBeCloseTo(0.2, 10);
  });

  it('без выручки доли не выдумывает', () => {
    expect(largestClientShare([])).toBeNull();
    expect(largestClientShare([row('1', 0)])).toBeNull();
  });

  it('молчит, когда есть только розница', () => {
    expect(largestClientShare([row('unknown', 500_000, 'Розница')])).toBeNull();
  });
});

describe('defectShare', () => {
  it('считает долю списанного от всего ушедшего со склада', () => {
    expect(defectShare(20, 80)).toBeCloseTo(0.2, 10);
  });

  // Ноль читался бы как «брака нет», хотя портиться было нечему.
  it('не выдаёт ноль, когда со склада ничего не уходило', () => {
    expect(defectShare(0, 0)).toBeNull();
  });
});

describe('collectBreaches', () => {
  const base = {
    defect: null,
    defectLimit: 0.15,
    concentration: null,
    concentrationLimit: 0.33,
    activeCustomers: 10,
    minCustomers: 5,
  };

  it('молчит, когда всё в норме', () => {
    expect(collectBreaches(base)).toEqual([]);
  });

  it('на границе не срабатывает — только при превышении', () => {
    expect(collectBreaches({ ...base, defect: 0.15 })).toEqual([]);
    expect(collectBreaches({ ...base, defect: 0.16 })).toHaveLength(1);
  });

  it('сообщает о зависимости от одного заведения', () => {
    const b = collectBreaches({
      ...base,
      concentration: { share: 0.5, label: 'Плов-центр' },
    });
    expect(b).toHaveLength(1);
    expect(b[0].metric).toBe('concentration');
    expect(b[0].title).toContain('Плов-центр');
  });

  it('сообщает о нехватке активных заведений', () => {
    const b = collectBreaches({ ...base, activeCustomers: 2 });
    expect(b[0].metric).toBe('customers');
  });

  it('собирает несколько нарушений разом', () => {
    const b = collectBreaches({
      ...base,
      defect: 0.4,
      concentration: { share: 0.9, label: 'Один клиент' },
      activeCustomers: 1,
    });
    expect(b.map((x) => x.metric)).toEqual(['defect', 'concentration', 'customers']);
  });
});

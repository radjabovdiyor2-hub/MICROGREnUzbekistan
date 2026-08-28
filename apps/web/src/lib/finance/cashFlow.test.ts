import { describe, it, expect } from 'vitest';
import { summarizeCashFlow, type CashEntry } from './cashFlow';

const day = (d: string) => new Date(`2026-08-${d}T12:00:00`);
const inc = (d: string, amount: number): CashEntry => ({ type: 'income', amount, date: day(d) });
const exp = (d: string, amount: number): CashEntry => ({ type: 'expense', amount, date: day(d) });

describe('summarizeCashFlow', () => {
  it('раскладывает приход и расход по дням', () => {
    const f = summarizeCashFlow([inc('10', 500_000), exp('10', 200_000), exp('12', 100_000)]);

    expect(f.days.map((d) => d.date)).toEqual(['2026-08-10', '2026-08-12']);
    expect(f.days[0].net).toBe(300_000);
    expect(f.inflow).toBe(500_000);
    expect(f.outflow).toBe(300_000);
    expect(f.net).toBe(200_000);
  });

  it('ведёт накопленное изменение нарастающим итогом', () => {
    const f = summarizeCashFlow([exp('10', 400_000), inc('15', 900_000)]);

    expect(f.days[0].change).toBe(-400_000);
    expect(f.days[1].change).toBe(500_000);
  });

  // Ради этого числа отчёт и нужен: месяц закрывается в плюс, пройдя
  // через неделю, в которую платить было нечем.
  it('показывает самую глубокую просадку, а не только итог', () => {
    const f = summarizeCashFlow([exp('05', 700_000), inc('25', 900_000)]);

    expect(f.worstChange).toBe(-700_000);
    expect(f.net).toBe(200_000);
  });

  it('складывает несколько операций одного дня', () => {
    const f = summarizeCashFlow([inc('10', 100_000), inc('10', 50_000), exp('10', 30_000)]);

    expect(f.days).toHaveLength(1);
    expect(f.days[0].inflow).toBe(150_000);
    expect(f.days[0].outflow).toBe(30_000);
  });

  it('считает всё, что не доход, расходом — без молчаливых потерь', () => {
    const f = summarizeCashFlow([{ type: 'что-то', amount: 10_000, date: day('10') }]);
    expect(f.outflow).toBe(10_000);
  });

  it('на пустом периоде не падает и не выдумывает просадку', () => {
    const f = summarizeCashFlow([]);
    expect(f.days).toEqual([]);
    expect(f.worstChange).toBe(0);
    expect(f.net).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import { summarizeAcquisition, MATURITY_DAYS } from './acquisition';

const TODAY = new Date('2026-08-28T12:00:00');
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(TODAY.getTime() - days * DAY);

describe('стоимость привлечения', () => {
  it('делит заходы на согласившиеся заведения', () => {
    const result = summarizeAcquisition(
      {
        visits: [
          { customerId: 1, at: ago(300) },
          { customerId: 1, at: ago(290) },
          { customerId: 2, at: ago(280) },
          { customerId: 3, at: ago(270) },
        ],
        wins: [{ customerId: 1, wonAt: ago(285) }],
        revenue: [],
      },
      TODAY,
    );

    expect(result.visits).toBe(4);
    expect(result.venues).toBe(3);
    expect(result.won).toBe(1);
    expect(result.visitsPerWin).toBe(4);
  });

  it('без согласий отдаёт прочерк, а не ноль', () => {
    // Ноль заходов на клиента читался бы как блестящий результат вместо
    // его отсутствия — ровно наоборот смыслу.
    const result = summarizeAcquisition(
      { visits: [{ customerId: 1, at: ago(10) }], wins: [], revenue: [] },
      TODAY,
    );

    expect(result.visitsPerWin).toBeNull();
    expect(result.won).toBe(0);
  });

  it('заведение с сайта не засчитывается объезду', () => {
    // Иначе отдача от ног считалась бы вместе с теми, к кому не ездили.
    const result = summarizeAcquisition(
      {
        visits: [{ customerId: 1, at: ago(300) }],
        wins: [
          { customerId: 1, wonAt: ago(290) },
          { customerId: 99, wonAt: ago(290) },
        ],
        revenue: [],
      },
      TODAY,
    );

    expect(result.won).toBe(1);
    expect(result.visitsPerWin).toBe(1);
  });

  it('недозревшее заведение в среднюю выручку не входит', () => {
    // Согласилось две недели назад: делить его выручку на полугодовой
    // горизонт — занижать тем сильнее, чем быстрее растёт база.
    const result = summarizeAcquisition(
      {
        visits: [
          { customerId: 1, at: ago(300) },
          { customerId: 2, at: ago(20) },
        ],
        wins: [
          { customerId: 1, wonAt: ago(290) },
          { customerId: 2, wonAt: ago(14) },
        ],
        revenue: [
          { customerId: 1, amount: 6_000_000, at: ago(200) },
          { customerId: 2, amount: 300_000, at: ago(7) },
        ],
      },
      TODAY,
    );

    expect(result.won).toBe(2);
    expect(result.matured).toBe(1);
    expect(result.revenuePerWon).toBe(6_000_000);
  });

  it('выручка за пределами полугода в отдачу не идёт', () => {
    const wonAt = ago(400);
    const result = summarizeAcquisition(
      {
        visits: [{ customerId: 1, at: ago(410) }],
        wins: [{ customerId: 1, wonAt }],
        revenue: [
          { customerId: 1, amount: 1_000_000, at: new Date(wonAt.getTime() + 10 * DAY) },
          {
            customerId: 1,
            amount: 5_000_000,
            at: new Date(wonAt.getTime() + (MATURITY_DAYS + 1) * DAY),
          },
        ],
      },
      TODAY,
    );

    expect(result.revenuePerWon).toBe(1_000_000);
  });

  it('пока никто не дозрел — отдача прочерк', () => {
    const result = summarizeAcquisition(
      {
        visits: [{ customerId: 1, at: ago(30) }],
        wins: [{ customerId: 1, wonAt: ago(20) }],
        revenue: [{ customerId: 1, amount: 400_000, at: ago(10) }],
      },
      TODAY,
    );

    expect(result.matured).toBe(0);
    expect(result.revenuePerWon).toBeNull();
  });

  it('повторный заезд к своему считается тоже', () => {
    // Поездка к действующему клиенту — потраченный день. Спрятать её
    // значило бы приукрасить стоимость привлечения.
    const result = summarizeAcquisition(
      {
        visits: [
          { customerId: 1, at: ago(300) },
          { customerId: 1, at: ago(100) },
        ],
        wins: [{ customerId: 1, wonAt: ago(290) }],
        revenue: [],
      },
      TODAY,
    );

    expect(result.visits).toBe(2);
    expect(result.visitsPerWin).toBe(2);
  });
});

describe('кого объезд вправе записать себе', () => {
  it('покупавший до первого захода в заслугу не идёт', () => {
    // Действующий клиент: поездка к нему была обслуживанием, а не
    // привлечением. Иначе отдача завышается ровно на тех, кого и
    // уговаривать не пришлось.
    const result = summarizeAcquisition(
      {
        visits: [
          { customerId: 1, at: ago(100) },
          { customerId: 2, at: ago(100) },
        ],
        wins: [
          { customerId: 1, wonAt: ago(150) },
          { customerId: 2, wonAt: ago(90) },
        ],
        revenue: [],
      },
      TODAY,
    );

    expect(result.won).toBe(1);
    expect(result.visitsPerWin).toBe(2);
  });
});

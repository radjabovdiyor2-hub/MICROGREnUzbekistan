import { describe, it, expect } from 'vitest';
import { summarizeUnearned } from './unearned';

const TODAY = new Date('2026-08-20T09:00:00');

describe('summarizeUnearned', () => {
  it('складывает оплаченные, но не выполненные заказы', () => {
    const r = summarizeUnearned(
      [
        { id: 'a', total: 300_000, createdAt: new Date('2026-08-18T10:00:00') },
        { id: 'b', total: 200_000, createdAt: new Date('2026-08-19T10:00:00') },
      ],
      TODAY,
    );

    expect(r.total).toBe(500_000);
    expect(r.count).toBe(2);
  });

  // Чем дольше деньги лежат неотработанными, тем выше шанс, что их
  // попросят обратно, — поэтому давние идут первыми.
  it('ставит самые давние первыми', () => {
    const r = summarizeUnearned(
      [
        { id: 'fresh', total: 10_000, createdAt: new Date('2026-08-19T10:00:00') },
        { id: 'old', total: 10_000, createdAt: new Date('2026-08-05T10:00:00') },
      ],
      TODAY,
    );

    expect(r.orders[0].id).toBe('old');
    expect(r.orders[0].daysWaiting).toBe(15);
  });

  it('считает дни календарно, а не по часам', () => {
    const r = summarizeUnearned(
      [{ id: 'a', total: 1000, createdAt: new Date('2026-08-19T23:50:00') }],
      TODAY,
    );

    expect(r.orders[0].daysWaiting).toBe(1);
  });

  it('не уводит ожидание в минус у заказа, оплаченного сегодня позже', () => {
    const r = summarizeUnearned(
      [{ id: 'a', total: 1000, createdAt: new Date('2026-08-20T23:00:00') }],
      TODAY,
    );

    expect(r.orders[0].daysWaiting).toBe(0);
  });

  it('без авансов отдаёт нули, а не падает', () => {
    const r = summarizeUnearned([], TODAY);
    expect(r.total).toBe(0);
    expect(r.orders).toEqual([]);
  });
});

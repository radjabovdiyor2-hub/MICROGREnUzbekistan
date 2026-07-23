import { describe, it, expect, vi, beforeEach } from 'vitest';

// Мокаем prisma до импорта тестируемого модуля. vi.hoisted — чтобы объект
// существовал к моменту, когда поднятый vi.mock его читает.
const db = vi.hoisted(() => ({
  loyaltyCard: { upsert: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  promoCode: { create: vi.fn() },
}));
vi.mock('@repo/database', () => ({ prisma: db }));

import { awardStamp, tashkentDay } from './loyalty';

const RESTO = { id: 'r1', slug: 'non-kabob', loyaltyGoal: 3, loyaltyRewardPercent: 15 };

beforeEach(() => {
  vi.clearAllMocks();
  db.loyaltyCard.update.mockResolvedValue({});
  db.promoCode.create.mockResolvedValue({});
});

describe('magazine/loyalty · awardStamp', () => {
  it('первый кадр за день даёт штамп', async () => {
    db.loyaltyCard.upsert.mockResolvedValue({ id: 'c1', stamps: 0, lastStampedOn: null, rewardCode: null });
    const r = await awardStamp(RESTO, 's1', '2026-07-23');
    expect(r.earnedToday).toBe(true);
    expect(r.stamps).toBe(1);
    expect(r.rewardCode).toBeNull();
  });

  it('второй кадр в тот же день штамп не даёт', async () => {
    db.loyaltyCard.upsert.mockResolvedValue({ id: 'c1', stamps: 1, lastStampedOn: '2026-07-23', rewardCode: null });
    const r = await awardStamp(RESTO, 's1', '2026-07-23');
    expect(r.earnedToday).toBe(false);
    expect(r.stamps).toBe(1);
    // карта не обновляется, если ни штампа, ни награды
    expect(db.loyaltyCard.update).not.toHaveBeenCalled();
  });

  it('на цели выдаёт промокод maxUses:1 ровно один раз', async () => {
    db.loyaltyCard.upsert.mockResolvedValue({ id: 'c1', stamps: 2, lastStampedOn: '2026-07-22', rewardCode: null });
    const r = await awardStamp(RESTO, 's1', '2026-07-23');
    expect(r.stamps).toBe(3);
    expect(r.rewardIssued).toBe(true);
    expect(r.rewardCode).toMatch(/^FW-NONKABOB-/);
    expect(db.promoCode.create).toHaveBeenCalledOnce();
    const arg = db.promoCode.create.mock.calls[0][0].data;
    expect(arg.maxUses).toBe(1);
    expect(arg.value).toBe(15);
    expect(arg.discountType).toBe('percent');
  });

  it('после выдачи награды повторно промокод не создаётся', async () => {
    db.loyaltyCard.upsert.mockResolvedValue({ id: 'c1', stamps: 5, lastStampedOn: '2026-07-22', rewardCode: 'FW-NONKABOB-ABC123' });
    const r = await awardStamp(RESTO, 's1', '2026-07-23');
    expect(r.rewardIssued).toBe(false);
    expect(r.rewardCode).toBe('FW-NONKABOB-ABC123');
    expect(db.promoCode.create).not.toHaveBeenCalled();
  });

  it('goal и rewardPercent по умолчанию, если у ресторана null', async () => {
    db.loyaltyCard.upsert.mockResolvedValue({ id: 'c1', stamps: 0, lastStampedOn: null, rewardCode: null });
    const r = await awardStamp({ id: 'r2', slug: 'x', loyaltyGoal: null, loyaltyRewardPercent: null }, 's2', '2026-07-23');
    expect(r.goal).toBe(5);
  });
});

describe('magazine/loyalty · tashkentDay', () => {
  it('сдвигает на UTC+5 — поздний вечер UTC уже следующий день в Ташкенте', () => {
    // 2026-07-23 20:00 UTC = 2026-07-24 01:00 в Ташкенте
    expect(tashkentDay(new Date('2026-07-23T20:00:00Z'))).toBe('2026-07-24');
    expect(tashkentDay(new Date('2026-07-23T10:00:00Z'))).toBe('2026-07-23');
  });
});

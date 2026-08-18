import { describe, expect, it, vi, beforeEach } from 'vitest';

// ══════════════════════════════════════════════════════════════════════
// Мост в CRM ломается не для одного заказа, а для всех сразу: 18.08.2026
// пустой INGEST_SECRET закрыл офис целиком. Без гашения повторов каждый
// заказ поднял бы своё оповещение, и вкладка сигналов превратилась бы в
// ленту одинаковых строк — то есть перестала бы что-либо значить.
//
// Второе свойство не менее важно: запись оповещения не имеет права уронить
// оформление заказа. Её зовут после того, как заказ уже создан.
// ══════════════════════════════════════════════════════════════════════

const findFirst = vi.fn();
const create = vi.fn();

vi.mock('@repo/database', () => ({
  prisma: { ownerAlert: { findFirst: (...a: unknown[]) => findFirst(...a), create: (...a: unknown[]) => create(...a) } },
}));

import { alertCrmSyncFailed } from './crmAlert';

beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue(null);
  create.mockResolvedValue({ id: BigInt(1) });
});

describe('сигнал о неработающем мосте в CRM', () => {
  it('поднимается, когда свежего такого сигнала нет', async () => {
    await alertCrmSyncFailed({ target: 'M-20260818-AAAA', channel: 'order' });

    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    expect(data.kind).toBe('crm_sync_failed');
    expect(data.severity).toBe('critical');
    expect(data.message).toContain('M-20260818-AAAA');
    // Владельцу нужна не констатация, а следующий шаг.
    expect(data.message).toContain('INGEST_SECRET');
  });

  it('не повторяется, пока свежий сигнал ещё висит', async () => {
    findFirst.mockResolvedValue({ id: BigInt(1) });
    await alertCrmSyncFailed({ target: 'M-20260818-BBBB', channel: 'order' });
    expect(create).not.toHaveBeenCalled();
  });

  it('ищет предыдущий сигнал по виду и за последний час', async () => {
    await alertCrmSyncFailed({ target: 'M-1', channel: 'order' });
    const where = findFirst.mock.calls[0][0].where;
    expect(where.kind).toBe('crm_sync_failed');
    expect(where.createdAt.gte).toBeInstanceOf(Date);
    const ageMs = Date.now() - (where.createdAt.gte as Date).getTime();
    expect(ageMs).toBeGreaterThan(59 * 60 * 1000);
    expect(ageMs).toBeLessThan(61 * 60 * 1000);
  });

  it('различает продажу за прилавком и заказ с сайта', async () => {
    await alertCrmSyncFailed({ target: 'S-20260818-CCCC', channel: 'pos' });
    expect(create.mock.calls[0][0].data.message).toContain('Продажа за прилавком');
  });

  it('называет причину отказа, если она известна', async () => {
    await alertCrmSyncFailed({ target: 'M-2', channel: 'order', reason: 'Office CRM returned status 401' });
    expect(create.mock.calls[0][0].data.message).toContain('401');
  });

  it('падение записи не выбрасывается наружу — заказ уже создан', async () => {
    create.mockRejectedValue(new Error('база недоступна'));
    await expect(
      alertCrmSyncFailed({ target: 'M-3', channel: 'order' }),
    ).resolves.toBeUndefined();
  });
});

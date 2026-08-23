import { beforeEach, describe, expect, it, vi } from 'vitest';

// ══════════════════════════════════════════════════════════════════════
// Очередь «витрина → AI-офис».
//
// До неё зеркало продажи вызывалось с `.catch(() => {})`: лежащий офис
// означал НАВСЕГДА потерянную привязку чека к клиенту. Счётчики карточки
// считаются офисом по `crm_orders`, поэтому непрошедшее зеркало — это не
// «отложенный отчёт», а ресторан, у которого покупки нет вовсе.
//
// Два правила, ради которых очередь и написана:
//   · отказ по существу (400) не должен держать очередь — за ним стоят
//     ДРУГИЕ чеки, и они важнее одного негодного;
//   · 401/403 — это не «запрос негоден», а пустой INGEST_SECRET, то есть
//     чинится настройкой. Такое выбрасывать нельзя.
// ══════════════════════════════════════════════════════════════════════

// `vi.mock` поднимается в начало файла, поэтому заглушки объявляются через
// `vi.hoisted` — иначе фабрика мока обратится к ещё не созданной переменной.
const { outbox, alert } = vi.hoisted(() => ({
  outbox: {
    findMany: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    upsert: vi.fn(),
  },
  // Без типизированных параметров: в тестах этого проекта заглушки
  // объявляются пустым vi.fn(), и обращение к calls[0][0] остаётся простым.
  alert: vi.fn(),
}));

vi.mock('@repo/database', () => ({
  prisma: { officeOutbox: outbox },
  Prisma: {},
}));

vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));
vi.mock('@/lib/metrics', () => ({ inc: vi.fn() }));
vi.mock('@/lib/orders/crmAlert', () => ({ alertCrmSyncFailed: alert }));

import { drainOffice, enqueueOffice } from './outbox';

const row = (over: Partial<{ id: number; topic: string; refKey: string; attempts: number }> = {}) => ({
  id: 1,
  topic: 'order',
  refKey: 'S-20260822-AAAA',
  payload: { order_number: 'S-20260822-AAAA' },
  attempts: 0,
  ...over,
});

function answers(status: number) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ status, ok: status < 400 }) as Response));
}

beforeEach(() => {
  vi.clearAllMocks();
  alert.mockClear();
  outbox.count.mockResolvedValue(0);
  outbox.delete.mockResolvedValue({});
  outbox.update.mockResolvedValue({});
  outbox.findMany.mockResolvedValue([]);
  vi.stubEnv('OFFICE_INGEST_URL', 'http://office/ingest/order');
});

describe('постановка в очередь', () => {
  it('идёт через upsert по номеру: повтор не создаёт вторую строку', async () => {
    const tx = { officeOutbox: { upsert: vi.fn() } };
    await enqueueOffice(tx as never, {
      topic: 'order',
      refKey: 'S-1',
      payload: { a: 1 },
    });
    const call = tx.officeOutbox.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ refKey: 'S-1' });
    // Пустой update: счётчик попыток повторной постановкой не сбрасывается.
    expect(call.update).toEqual({});
  });
});

describe('разбор очереди', () => {
  it('принятое офисом удаляется', async () => {
    outbox.findMany.mockResolvedValue([row()]);
    answers(200);
    const res = await drainOffice();
    expect(res.sent).toBe(1);
    expect(outbox.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it('дубликат на стороне офиса тоже считается доставкой', async () => {
    // `/ingest/order` отвечает 200 и `{"status":"duplicate"}` — повторять
    // такое незачем, строка своё отработала.
    outbox.findMany.mockResolvedValue([row()]);
    answers(200);
    await drainOffice();
    expect(outbox.delete).toHaveBeenCalled();
  });

  it('5xx оставляет строку и отодвигает следующую попытку', async () => {
    outbox.findMany.mockResolvedValue([row()]);
    answers(503);
    await drainOffice();
    expect(outbox.delete).not.toHaveBeenCalled();
    const data = outbox.update.mock.calls[0][0].data;
    expect(data.attempts).toBe(1);
    expect(data.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('401 оставляет строку: это пустой секрет, а не негодный запрос', async () => {
    outbox.findMany.mockResolvedValue([row()]);
    answers(401);
    await drainOffice();
    expect(outbox.delete).not.toHaveBeenCalled();
    expect(outbox.update).toHaveBeenCalled();
  });

  it('400 снимает строку, но поднимает тревогу', async () => {
    outbox.findMany.mockResolvedValue([row()]);
    answers(400);
    await drainOffice();
    expect(outbox.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(alert).toHaveBeenCalled();
  });

  it('обрыв связи прекращает проход — остальные упрутся в то же', async () => {
    outbox.findMany.mockResolvedValue([row({ id: 1 }), row({ id: 2, refKey: 'S-2' })]);
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('fetch failed');
    }));
    await drainOffice();
    // Первая отодвинута, вторую даже не пробовали.
    expect(outbox.update).toHaveBeenCalledTimes(1);
  });

  it('на пороге неудач владелец получает сигнал', async () => {
    outbox.findMany.mockResolvedValue([row({ attempts: 2 })]);
    answers(503);
    await drainOffice();
    expect(alert).toHaveBeenCalled();
  });

  it('до порога молчим: мост чинится не с первой секунды', async () => {
    outbox.findMany.mockResolvedValue([row({ attempts: 0 })]);
    answers(503);
    await drainOffice();
    expect(alert).not.toHaveBeenCalled();
  });

  it('возврат помечается своим каналом — это другая беда', async () => {
    outbox.findMany.mockResolvedValue([row({ refKey: 'R-20260822-BBBB', attempts: 2 })]);
    answers(503);
    await drainOffice();
    expect(alert.mock.calls[0][0]).toMatchObject({ channel: 'refund' });
  });

  it('падение базы не роняет кассу', async () => {
    outbox.findMany.mockRejectedValue(new Error('база недоступна'));
    await expect(drainOffice()).resolves.toMatchObject({ sent: 0 });
  });
});

describe('заказ сайта переживает лежащий офис', () => {
  it('статусы одного заказа — разные события, второе не затирает первое', async () => {
    // Ключ очереди для статуса — номер И сам переход. Будь он просто
    // номером, «подтверждён» затёр бы «в пути»: `upsert` по тому же ключу
    // не создаёт вторую строку, и один из переходов исчез бы молча.
    const tx = { officeOutbox: { upsert: vi.fn() } };

    await enqueueOffice(tx as never, {
      topic: 'order-status',
      refKey: 'M-1:CONFIRMED:',
      payload: { order_number: 'M-1', status: 'confirmed' },
    });
    await enqueueOffice(tx as never, {
      topic: 'order-status',
      refKey: 'M-1:DELIVERING:',
      payload: { order_number: 'M-1', status: 'delivering' },
    });

    const keys = tx.officeOutbox.upsert.mock.calls.map((c) => c[0].where.refKey);
    expect(new Set(keys).size).toBe(2);
  });

  it('повтор того же события строку не удваивает', async () => {
    const tx = { officeOutbox: { upsert: vi.fn() } };

    await enqueueOffice(tx as never, {
      topic: 'order',
      refKey: 'M-2',
      payload: { order_number: 'M-2' },
    });

    // Тот же ключ — тот же заказ. `upsert` с пустым `update` не сбрасывает
    // счётчик попыток: иначе застрявшая строка вечно начинала бы заново.
    const call = tx.officeOutbox.upsert.mock.calls[0][0];
    expect(call.where.refKey).toBe('M-2');
    expect(call.update).toEqual({});
  });
});

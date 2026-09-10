import { describe, expect, it } from 'vitest';

import { classify } from './sendPings';

// Различие «повторить» и «ждать бесполезно» стоит человеку целого дня:
// пачка, которую крутят по минуте, копит очередь до потолка, и вечером
// выясняется, что трека нет. Поэтому оно проверяется, а не подразумевается.

describe('classify', () => {
  it('успех есть успех', () => {
    expect(classify(200).kind).toBe('ok');
    expect(classify(204).kind).toBe('ok');
  });

  it('сессия истекла и доступ закрыт — повтором не лечится', () => {
    expect(classify(401).kind).toBe('rejected');
    expect(classify(403).kind).toBe('rejected');
  });

  it('слова сервера доходят до человека без пересказа', () => {
    // «Совпадают имена сотрудников» чинит владелец, и продавцу надо
    // передать ему ровно эту фразу.
    const r = classify(403, 'Совпадают имена сотрудников — трек некому приписать');
    expect(r.kind === 'rejected' && r.message).toContain('Совпадают имена');
  });

  it('отказ без объяснения всё равно называется словом', () => {
    const r = classify(403, '   ');
    expect(r.kind === 'rejected' && r.message.length > 0).toBe(true);
  });

  it('поломка сервера — повторяем', () => {
    expect(classify(500).kind).toBe('retry');
    expect(classify(502).kind).toBe('retry');
  });

  it('перегрузка и таймаут — повторяем, а не выбрасываем день', () => {
    expect(classify(429).kind).toBe('retry');
    expect(classify(408).kind).toBe('retry');
  });

  it('непонятный код считаем временным', () => {
    // Ошибиться в сторону повтора безопасно: пачка полежит в очереди.
    // Ошибиться в сторону отказа — значит выбросить работу человека.
    expect(classify(418).kind).toBe('retry');
    expect(classify(0).kind).toBe('retry');
  });
});

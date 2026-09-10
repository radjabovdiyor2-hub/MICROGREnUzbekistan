import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { notifyCustomer } from '@/lib/notify';

import { announceShiftClose, announceShiftOpen } from './announce';

// Смену открывают в трёх местах, а сказать о ней человеку можно только в
// Telegram. Здесь проверяется РЕШЕНИЕ — писать или молчать, и каким
// токеном, — а не доставка: её проверить можно только живым сообщением.

vi.mock('@/lib/notify', () => ({ notifyCustomer: vi.fn(async () => true) }));

const sent = vi.mocked(notifyCustomer);
// `BigInt(555)`, а не литерал `555n`: цель сборки ниже ES2020, и `next
// build` проверяет типы вместе с тестами — литерал ломает СБОРКУ, хотя
// Vitest его глотает.
const ID = BigInt(555);

beforeEach(() => {
  sent.mockClear();
  sent.mockResolvedValue(true);
  process.env.SALES_BOT_TOKEN = 'sales-token';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('announceShiftOpen', () => {
  it('открыли в вебе — человек узнаёт об этом в Telegram', async () => {
    await announceShiftOpen(ID, new Date('2026-09-11T09:05:00'), 'web');

    expect(sent).toHaveBeenCalledTimes(1);
    const [to, text] = sent.mock.calls[0];
    expect(to).toBe(ID);
    expect(text).toContain('Смена открыта');
    expect(text).toContain('09:05');
  });

  it('вместе с сообщением приходит инструкция про трансляцию', async () => {
    // Включить её за человека нельзя ни боту, ни серверу — поэтому
    // сообщение обязано говорить, что нажать. Без этого смена открыта, а
    // маршрута нет, и никто об этом не напомнил.
    await announceShiftOpen(ID, new Date(), 'pwa');

    const [, text] = sent.mock.calls[0];
    expect(text).toContain('Транслировать');
    expect(text).toContain('даже боту');
  });

  it('токен — бота продаж: он же обрабатывает кнопку', async () => {
    // Telegram доставляет нажатие тому боту, чьим токеном отправлено
    // сообщение. Кнопка от витринного бота до полевых обработчиков не
    // дойдёт никогда — и это не видно ни сборкой, ни линтером.
    await announceShiftOpen(ID, new Date(), 'web');

    const [, , markup, token] = sent.mock.calls[0];
    expect(token).toBe('sales-token');
    expect(JSON.stringify(markup)).toContain('field:day');
  });

  it('открыли в самом боте — второго сообщения нет', async () => {
    // Там ответ с той же подсказкой уже есть, а шум перестают читать
    // вместе с нужным.
    await announceShiftOpen(ID, new Date(), 'bot');

    expect(sent).not.toHaveBeenCalled();
  });

  it('без Telegram писать некуда — и это не ошибка', async () => {
    await announceShiftOpen(null, new Date(), 'web');

    expect(sent).not.toHaveBeenCalled();
  });

  it('молчание Telegram не роняет открытие смены', async () => {
    // Смена уже открыта на сервере; отвечать человеку ошибкой на успешное
    // действие нельзя.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sent.mockRejectedValueOnce(new Error('telegram unreachable'));

    await expect(announceShiftOpen(ID, new Date(), 'web')).resolves.toBeUndefined();
  });
});

describe('announceShiftClose', () => {
  it('закрытие подтверждается и напоминает выключить трансляцию', async () => {
    await announceShiftClose(ID, new Date('2026-09-11T18:40:00'), 'pwa');

    const [, text] = sent.mock.calls[0];
    expect(text).toContain('Смена закрыта');
    expect(text).toContain('18:40');
    expect(text).toContain('Трансляцию геопозиции');
  });

  it('закрыли в боте — молчим и здесь', async () => {
    await announceShiftClose(ID, new Date(), 'bot');

    expect(sent).not.toHaveBeenCalled();
  });
});

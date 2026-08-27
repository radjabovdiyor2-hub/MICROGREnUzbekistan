import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// ══════════════════════════════════════════════════════════════════════
// Отказ Telegram виден, а не выглядит доставкой.
//
// ⚠️ `fetch` НЕ ОТКЛОНЯЕТСЯ НА HTTP-ОТВЕТЕ. 400 и 401 приходят как обычный
// успешный ответ, и `.catch()` на них не срабатывает никогда.
//
// Именно так были написаны уведомления кассы и возврата:
// `fetch(...).catch(() => {})`. Отозванный токен бота — а его уже
// приходилось менять — давал 401 на каждую отправку, и это выглядело
// доставленным сообщением. Уведомления о продажах могли не приходить
// месяцами: в логе тихо, в коде видно `catch`, значит «обработано».
//
// Тест держит два свойства: отказ возвращает `false` и попадает в лог с
// описанием (по «chat not found» и «Unauthorized» лечат по-разному, а без
// текста они неразличимы), а токен в лог не попадает.
// ══════════════════════════════════════════════════════════════════════

const TOKEN = '111:AAA-secret-token-value';

describe('уведомления в Telegram', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;
    process.env.ADMIN_CHAT_ID = '42';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const load = () => import('./notify');

  it('401 от Telegram — это неудача, а не доставка', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"ok":false,"description":"Unauthorized"}', { status: 401 })),
    );
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args.map(String).join(' '));
    });

    const { notifyAdmin } = await load();
    const delivered = await notifyAdmin({ type: 'sale', message: 'чек на 150 000' });

    expect(delivered).toBe(false);
    expect(errors.join('\n')).toContain('Unauthorized');
  });

  it('токен не попадает в лог вместе с ошибкой', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"ok":false,"description":"chat not found"}', { status: 400 })),
    );
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args.map(String).join(' '));
    });

    const { notifyAdminRaw } = await load();
    await notifyAdminRaw('возврат #12');

    expect(errors.join('\n')).toContain('chat not found');
    expect(errors.join('\n')).not.toContain(TOKEN);
    expect(errors.join('\n')).not.toContain('AAA-secret');
  });

  it('успешная отправка возвращает true', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true}', { status: 200 })));

    const { notifyAdmin } = await load();
    await expect(notifyAdmin({ type: 'order', message: 'заказ №7' })).resolves.toBe(true);
  });

  it('без токена не ходим в сеть вовсе', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const call = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', call);

    const { notifyAdmin, notifyAdminRaw } = await load();

    await expect(notifyAdmin({ type: 'info', message: 'x' })).resolves.toBe(false);
    await expect(notifyAdminRaw('y')).resolves.toBe(false);
    expect(call).not.toHaveBeenCalled();
  });

  it('сетевой отказ тоже неудача, а не исключение наружу', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { notifyAdmin } = await load();
    await expect(notifyAdmin({ type: 'sale', message: 'чек' })).resolves.toBe(false);
  });
});

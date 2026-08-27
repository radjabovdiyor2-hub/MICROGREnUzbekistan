import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// ══════════════════════════════════════════════════════════════════════
// Сообщение из WhatsApp доходит до офиса, а не до лога.
//
// Ссылка на WhatsApp стоит в подвале сайта — клиенты по ней пишут. Их
// сообщение доходило до сервера, проходило проверку подписи Meta и
// оставалось строкой `console.log` с комментарием «Future: Event bus».
// Ни ответа, ни записи в CRM, ни сигнала владельцу: обращение
// существовало ровно до следующего перезапуска контейнера.
//
// Проверяется цепочка целиком: подпись обязательна, текст доходит до той
// же двери офиса, которой пользуется форма поддержки сайта, и владелец
// получает сигнал. Плюс вложение без текста — оно не должно превращаться
// в пустое обращение, по которому непонятно, что человек хотел.
// ══════════════════════════════════════════════════════════════════════

const SECRET = 'meta-app-secret';

const officeCalls: unknown[] = [];
const adminCalls: unknown[] = [];

vi.mock('@/lib/office/client', () => ({
  notifyOfficeSupport: vi.fn(async (input: unknown) => {
    officeCalls.push(input);
  }),
}));

vi.mock('@/lib/notify', () => ({
  notifyAdmin: vi.fn(async (input: unknown) => {
    adminCalls.push(input);
    return true;
  }),
}));

function sign(body: string): string {
  // Подпись Meta: HMAC-SHA256 тела приложением-секретом.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('crypto') as typeof import('crypto');
  return 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
}

function payload(text: string | null, type = 'text') {
  const message: Record<string, unknown> = { type };
  if (text !== null) message.text = { body: text };
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              contacts: [{ wa_id: '998901234567', profile: { name: 'Дилшод' } }],
              messages: [message],
            },
          },
        ],
      },
    ],
  };
}

async function post(body: unknown, signature?: string) {
  const raw = JSON.stringify(body);
  const { POST } = await import('./route');
  return POST(
    new Request('https://example.com/api/whatsapp/webhook', {
      method: 'POST',
      headers: { 'x-hub-signature-256': signature ?? sign(raw) },
      body: raw,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
  );
}

describe('вебхук WhatsApp', () => {
  beforeEach(() => {
    vi.resetModules();
    officeCalls.length = 0;
    adminCalls.length = 0;
    process.env.WHATSAPP_APP_SECRET = SECRET;
    // Запасное имя тоже надо убрать: `signatureOk` берёт его при пустом
    // основном, и тест «без секрета» иначе прошёл бы по чужому ключу.
    delete process.env.FACEBOOK_APP_SECRET;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('сообщение клиента доходит до офиса и до владельца', async () => {
    const res = await post(payload('Здравствуйте, есть руккола?'));

    expect(res.status).toBe(200);
    expect(officeCalls).toHaveLength(1);

    const sent = officeCalls[0] as { phone: string; name: string; message: string };
    expect(sent.phone).toBe('998901234567');
    expect(sent.name).toBe('Дилшод');
    expect(sent.message).toContain('есть руккола');
    // Канал виден в тексте: отвечать на WhatsApp надо в WhatsApp.
    expect(sent.message).toContain('WhatsApp');

    expect(adminCalls).toHaveLength(1);
  });

  it('вложение без текста не становится пустым обращением', async () => {
    await post(payload(null, 'image'));

    expect(officeCalls).toHaveLength(1);
    const sent = officeCalls[0] as { message: string };
    expect(sent.message).toContain('image');
    expect(sent.message.replace('WhatsApp: ', '').trim().length).toBeGreaterThan(0);
  });

  it('чужая подпись — 403 и ничего не создаётся', async () => {
    const res = await post(payload('привет'), 'sha256=deadbeef');

    expect(res.status).toBe(403);
    expect(officeCalls).toHaveLength(0);
    expect(adminCalls).toHaveLength(0);
  });

  it('без секрета в окружении вебхук закрыт, а не открыт всем', async () => {
    delete process.env.WHATSAPP_APP_SECRET;
    delete process.env.FACEBOOK_APP_SECRET;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await post(payload('привет'));

    expect(res.status).toBe(403);
    expect(officeCalls).toHaveLength(0);
  });
});

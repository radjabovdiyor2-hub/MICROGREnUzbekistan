import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import { signProposal, verifyProposal } from './proposal';

// Подпись гарантирует, что выполнено будет ровно то действие, которое
// показали владельцу в карточке. Без неё execute доверял бы телу запроса.

beforeAll(() => {
  process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';
});

const payload = {
  tool: 'change_product_price',
  args: { productId: 'abc', newPrice: 30000 },
  summary: 'Изменить цену «Редис»',
  before: '25 000 сум',
  after: '30 000 сум',
  risky: true,
};

describe('подпись предложений Стёпана', () => {
  it('проходит круг подписи и проверки без потерь', () => {
    const token = signProposal(payload)!;
    expect(token).toBeTruthy();
    expect(verifyProposal(token)).toEqual(payload);
  });

  it('отвергает подделанное тело', () => {
    const token = signProposal(payload)!;
    const [body, sig] = token.split('.');

    // Подменяем цену 30000 на 3 — как если бы аргументы правили в пути.
    const tampered = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    tampered.args.newPrice = 3;
    const forgedBody = Buffer.from(JSON.stringify(tampered), 'utf-8').toString('base64url');

    expect(verifyProposal(`${forgedBody}.${sig}`)).toBeNull();
  });

  it('отвергает подделанную подпись', () => {
    const token = signProposal(payload)!;
    const [body] = token.split('.');
    expect(verifyProposal(`${body}.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`)).toBeNull();
  });

  it('отвергает просроченное предложение', () => {
    // Собираем токен с истёкшим exp тем же секретом.
    const expired = JSON.stringify({ ...payload, exp: Date.now() - 1000 });
    const b64 = Buffer.from(expired, 'utf-8').toString('base64url');
    const sig = crypto.createHmac('sha256', process.env.SESSION_SECRET!)
      .update(b64).digest('base64url');

    expect(verifyProposal(`${b64}.${sig}`)).toBeNull();
  });

  it('отвергает мусор вместо токена', () => {
    expect(verifyProposal('')).toBeNull();
    expect(verifyProposal('no-dot')).toBeNull();
    expect(verifyProposal('a.b')).toBeNull();
  });
});

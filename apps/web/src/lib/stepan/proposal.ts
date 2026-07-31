import crypto from 'crypto';

// ══════════════════════════════════════════════════════════════════════
// Подпись предложенных действий.
//
// Владелец видит карточку «изменить цену с 25 000 на 30 000» и нажимает
// «Выполнить». Между показом и выполнением проходит HTTP-запрос, и без
// подписи исполнялось бы то, что прислал клиент, а не то, что было
// показано. Подпись гарантирует: выполняется ровно предъявленное.
//
// Живёт 15 минут — карточка, провисевшая полдня, скорее всего относится
// к устаревшим данным, и подтверждать её вслепую не стоит.
// ══════════════════════════════════════════════════════════════════════

const TTL_MS = 15 * 60 * 1000;

export interface ProposalPayload {
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  before?: string;
  after?: string;
  risky?: boolean;
}

function secret(): string | null {
  return (
    process.env.SESSION_SECRET ||
    process.env.JWT_SECRET ||
    (process.env.NODE_ENV !== 'production' ? 'dev-only-insecure-proposal-secret' : null)
  );
}

export function signProposal(payload: ProposalPayload): string | null {
  const key = secret();
  if (!key) return null;

  const body = JSON.stringify({ ...payload, exp: Date.now() + TTL_MS });
  const b64 = Buffer.from(body, 'utf-8').toString('base64url');
  const sig = crypto.createHmac('sha256', key).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

export function verifyProposal(token: string): ProposalPayload | null {
  const key = secret();
  if (!key || !token) return null;

  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return null;

  const expected = crypto.createHmac('sha256', key).update(b64).digest('base64url');
  // timingSafeEqual бросает на разной длине — сверяем её заранее.
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  try {
    const parsed = JSON.parse(Buffer.from(b64, 'base64url').toString('utf-8'));
    if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null;
    const { exp, ...payload } = parsed;
    return payload as ProposalPayload;
  } catch {
    return null;
  }
}

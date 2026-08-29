import { NextRequest, NextResponse } from 'next/server';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';

import { actorOf, isAuthorized, unauthorized } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';
import { Metrics } from '@/lib/metrics';
import { clientIp, consume, reset, tooManyRequests } from '@/lib/rateLimit';
import { createSession, SESSION_COOKIE, sessionCookieOptions, sessionFingerprint } from '@/lib/session';
import {
  addCredential,
  counterLooksCloned,
  findCredential,
  hasCredentials,
  listCredentials,
  putChallenge,
  removeCredential,
  takeChallenge,
  updateCounter,
} from '@/lib/auth/passkeys';

// ══════════════════════════════════════════════════════════════════════
// Вход по Face ID / Touch ID (WebAuthn).
//
// ПОЧЕМУ ОН БЫЛ ВЫКЛЮЧЕН И ЧТО ИЗМЕНИЛОСЬ
//
// Прежняя реализация подпись не проверяла: `login-verify` сверял только
// `credential.id` со списком, а `login-options` этот же id и выдавал —
// войти владельцем можно было двумя запросами без криптографии вовсе.
// Поэтому вход отвечал 501, а не «работал плохо».
//
// Теперь проверку делает `@simplewebauthn/server`: подпись, задача,
// источник, RP ID и счётчик клонов. Своей криптографии здесь нет и быть
// не должно.
//
// ВХОД ДАЁТ РОВНО ТУ ЖЕ СЕССИЮ, ЧТО И ПАРОЛЬ. Та же кука, тот же отпечаток
// (ip + user-agent), тот же срок, та же запись в аудит. Второй способ входа
// не должен означать второй, более слабый вид доступа.
//
// РЕГИСТРАЦИЯ ТОЛЬКО ИЗНУТРИ. Привязать ключ можно, лишь уже войдя паролем:
// иначе первый встречный привязал бы свой палец к чужой админке.
// ══════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs';

/** Столько же, сколько у пароля: вход есть вход, откуда бы он ни шёл. */
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

const RP_NAME = 'Microgreen Admin';
const USER_NAME = 'admin';

/**
 * Домен, для которого выпущен ключ.
 *
 * Переменная важнее заголовка: за обратным прокси `host` бывает внутренним
 * (`web:3000`), и ключ, выпущенный на такое имя, не подойдёт снаружи.
 */
function rpId(req: NextRequest): string {
  if (process.env.WEBAUTHN_RP_ID) return process.env.WEBAUTHN_RP_ID;
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost';
  return host.split(':')[0];
}

/**
 * Источник, который браузер подписал.
 *
 * Сверяется с тем, что пришло в подписи: без этой проверки ключ, выпущенный
 * для нашего домена, принимался бы со страницы злоумышленника.
 */
function expectedOrigin(req: NextRequest): string {
  const origin = req.headers.get('origin');
  if (origin) return origin;
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }
  const action = String((body as Record<string, unknown>).action ?? '');
  const ip = clientIp(req);

  // ── Вход: доступен без сессии, поэтому под лимитом ────────────────
  if (action === 'login-options') {
    if (!hasCredentials()) {
      return NextResponse.json(
        { error: 'Ключи не привязаны', code: 'NO_CREDENTIALS' },
        { status: 404 },
      );
    }
    const options = await generateAuthenticationOptions({
      rpID: rpId(req),
      userVerification: 'required',
      allowCredentials: listCredentials().map((c) => ({
        id: c.id,
        transports: c.transports as AuthenticatorTransportFuture[] | undefined,
      })),
    });
    const sessionId = putChallenge(options.challenge);
    return NextResponse.json({ sessionId, publicKey: options });
  }

  if (action === 'login-verify') {
    const limit = await consume(`webauthn:${ip}`, LOGIN_LIMIT, LOGIN_WINDOW_MS);
    if (!limit.ok) {
      audit({ action: 'login.ratelimited', actor: 'owner', ip });
      Metrics.rateLimited('auth/webauthn');
      return tooManyRequests(limit.retryAfter);
    }

    const { sessionId, credential } = body as {
      sessionId?: string;
      credential?: { id?: string };
    };
    const challenge = sessionId ? takeChallenge(sessionId) : null;
    if (!challenge) {
      return NextResponse.json({ error: 'Срок запроса истёк — повторите' }, { status: 400 });
    }

    const stored = credential?.id ? findCredential(credential.id) : null;
    if (!stored) {
      audit({ action: 'login.failed', actor: 'passkey', ip });
      Metrics.loginFailed('passkey');
      return NextResponse.json({ error: 'Ключ не привязан' }, { status: 401 });
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: credential as never,
        expectedChallenge: challenge,
        expectedOrigin: expectedOrigin(req),
        expectedRPID: rpId(req),
        requireUserVerification: true,
        credential: {
          id: stored.id,
          publicKey: Buffer.from(stored.publicKey, 'base64url'),
          counter: stored.counter,
          transports: stored.transports as AuthenticatorTransportFuture[] | undefined,
        },
      });
    } catch (error) {
      audit({ action: 'login.failed', actor: 'passkey', ip });
      Metrics.loginFailed('passkey');
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Подпись не принята' },
        { status: 401 },
      );
    }

    if (!verification.verified) {
      audit({ action: 'login.failed', actor: 'passkey', ip });
      Metrics.loginFailed('passkey');
      return NextResponse.json({ error: 'Подпись не принята' }, { status: 401 });
    }

    const next = verification.authenticationInfo.newCounter;
    if (counterLooksCloned(stored.counter, next)) {
      // Счётчик не вырос — либо повтор, либо копия ключа. Пускать нельзя,
      // и молчать об этом тоже: владельцу нужно знать, что ключ отозвать.
      audit({ action: 'login.passkey.cloned', actor: stored.label, ip, target: stored.id });
      Metrics.loginFailed('passkey');
      return NextResponse.json(
        { error: 'Ключ отклонён: счётчик не изменился. Привяжите ключ заново.' },
        { status: 401 },
      );
    }
    updateCounter(stored.id, next);

    const token = await createSession({
      role: 'ADMIN',
      fp: await sessionFingerprint(ip, req.headers.get('user-agent') ?? ''),
    });
    if (!token) {
      return NextResponse.json(
        { error: 'SESSION_SECRET sozlanmagan — kirish vaqtincha yopiq' },
        { status: 503 },
      );
    }

    await reset(`webauthn:${ip}`);
    audit({ action: 'login.success', actor: 'owner', role: 'ADMIN', ip, target: stored.label });
    Metrics.loginSuccess('ADMIN');

    const res = NextResponse.json({ success: true, valid: true, role: 'ADMIN' });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  }

  // ── Всё остальное — только уже вошедшему ──────────────────────────
  if (!isAuthorized(req)) return unauthorized();

  if (action === 'register-options') {
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: rpId(req),
      userName: USER_NAME,
      userDisplayName: 'Владелец',
      attestationType: 'none',
      authenticatorSelection: {
        // Платформенный аутентификатор — это и есть Face ID / Touch ID.
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      excludeCredentials: listCredentials().map((c) => ({ id: c.id })),
    });
    const sessionId = putChallenge(options.challenge);
    return NextResponse.json({ sessionId, publicKey: options });
  }

  if (action === 'register-verify') {
    const { sessionId, credential, label } = body as {
      sessionId?: string;
      credential?: unknown;
      label?: string;
    };
    const challenge = sessionId ? takeChallenge(sessionId) : null;
    if (!challenge) {
      return NextResponse.json({ error: 'Срок запроса истёк — повторите' }, { status: 400 });
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: credential as never,
        expectedChallenge: challenge,
        expectedOrigin: expectedOrigin(req),
        expectedRPID: rpId(req),
        requireUserVerification: true,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Ключ не принят' },
        { status: 400 },
      );
    }

    const info = verification.registrationInfo;
    if (!verification.verified || !info) {
      return NextResponse.json({ error: 'Ключ не принят' }, { status: 400 });
    }

    addCredential({
      id: info.credential.id,
      // base64url, потому что хранилище — JSON: сырые байты туда не лягут.
      publicKey: Buffer.from(info.credential.publicKey).toString('base64url'),
      counter: info.credential.counter,
      transports: info.credential.transports,
      createdAt: new Date().toISOString(),
      label: String(label || 'Ключ входа').slice(0, 60),
    });

    audit({
      action: 'passkey.add',
      ...actorOf(req),
      ip,
      target: info.credential.id,
    });
    return NextResponse.json({ ok: true, credentialId: info.credential.id });
  }

  if (action === 'list') {
    return NextResponse.json({
      credentials: listCredentials().map((c) => ({
        id: c.id,
        label: c.label,
        createdAt: c.createdAt,
      })),
    });
  }

  if (action === 'delete') {
    const id = String((body as Record<string, unknown>).credentialId ?? '');
    if (!id) return NextResponse.json({ error: 'Нужен credentialId' }, { status: 400 });
    removeCredential(id);
    audit({ action: 'passkey.remove', ...actorOf(req), ip, target: id });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

/** Есть ли привязанные ключи — по этому вопросу экран входа решает, показывать ли кнопку. */
export async function GET() {
  return NextResponse.json({ available: hasCredentials() });
}

type AuthenticatorTransportFuture = Parameters<
  typeof verifyAuthenticationResponse
>[0]['credential']['transports'] extends (infer T)[] | undefined
  ? T
  : never;

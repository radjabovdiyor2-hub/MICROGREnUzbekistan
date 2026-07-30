import { NextRequest, NextResponse } from 'next/server';
import {
  verifyPassword,
  setPassword,
  isPasswordConfigured,
  MIN_PASSWORD_LENGTH,
} from '@/lib/password';
import { createSession, SESSION_COOKIE, sessionCookieOptions, sessionFingerprint } from '@/lib/session';
import { consume, reset, clientIp, tooManyRequests } from '@/lib/rateLimit';
import { audit } from '@/lib/audit';
import { Metrics } from '@/lib/metrics';

// ══════════════════════════════════════════════════════════════════════
// Вход владельца и смена пароля.
//
// Что изменилось и почему:
//  · GET ?password=… УДАЛЁН. Пароль в query-строке оседал в access-логах
//    nginx, в истории браузера и в Referer — то есть утекал при каждом входе.
//  · Пароль больше не сравнивается с захардкоженной строкой и не хранится
//    открытым текстом (см. lib/password.ts).
//  · Успешный вход выдаёт подписанную httpOnly-cookie. Клиент больше не
//    держит пароль в sessionStorage и не шлёт его в каждом запросе.
//  · Появился лимит попыток — раньше пароль можно было перебирать.
// ══════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs';

/** 10 попыток за 15 минут на IP. */
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }

  const action = body.action === 'change' ? 'change' : 'login';
  const ip = clientIp(req);

  // ── Смена пароля ────────────────────────────────────────────────────
  if (action === 'change') {
    const currentPassword = String(body.currentPassword ?? '');
    const newPassword = String(body.newPassword ?? '');

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Barcha maydonlarni to'ldiring" }, { status: 400 });
    }

    const limit = await consume(`pwchange:${ip}`, LOGIN_LIMIT, LOGIN_WINDOW_MS);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    if (!verifyPassword(currentPassword)) {
      audit({ action: 'password.change.failed', actor: 'owner', ip });
      return NextResponse.json({ error: "Joriy parol noto'g'ri" }, { status: 401 });
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Yangi parol kamida ${MIN_PASSWORD_LENGTH} ta belgi bo'lishi kerak` },
        { status: 400 },
      );
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: 'Yangi parol eski paroldan farqli bo\'lishi kerak' },
        { status: 400 },
      );
    }

    setPassword(newPassword);
    await reset(`pwchange:${ip}`);
    audit({ action: 'password.change', actor: 'owner', ip });

    return NextResponse.json({
      success: true,
      message: "Parol muvaffaqiyatli o'zgartirildi",
    });
  }

  // ── Вход ────────────────────────────────────────────────────────────
  const password = String(body.password ?? '');
  if (!password) {
    return NextResponse.json({ error: 'password required' }, { status: 400 });
  }

  const limit = await consume(`login:${ip}`, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  if (!limit.ok) {
    audit({ action: 'login.ratelimited', actor: 'owner', ip });
    Metrics.rateLimited('auth/password');
    return tooManyRequests(limit.retryAfter);
  }

  if (!isPasswordConfigured()) {
    // Отдельный код, чтобы оператор понял: дело не в пароле, а в настройке.
    return NextResponse.json(
      { error: 'Admin parol sozlanmagan — serverda ADMIN_PASSWORD ni qo\'ying' },
      { status: 503 },
    );
  }

  if (!verifyPassword(password)) {
    audit({ action: 'login.failed', actor: 'owner', ip });
    Metrics.loginFailed('password');
    return NextResponse.json({ valid: false, error: "Parol noto'g'ri" }, { status: 401 });
  }

  const ua = req.headers.get('user-agent') ?? '';
  const fp = await sessionFingerprint(ip, ua);
  const token = await createSession({ role: 'ADMIN', fp });
  if (!token) {
    return NextResponse.json(
      { error: 'SESSION_SECRET sozlanmagan — kirish vaqtincha yopiq' },
      { status: 503 },
    );
  }

  await reset(`login:${ip}`);
  audit({ action: 'login.success', actor: 'owner', role: 'ADMIN', ip });
  Metrics.loginSuccess('ADMIN');

  const res = NextResponse.json({ success: true, valid: true, role: 'ADMIN' });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}

// ── Выход ─────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  audit({ action: 'logout', actor: 'owner', ip: clientIp(req) });
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(0), maxAge: 0 });
  return res;
}

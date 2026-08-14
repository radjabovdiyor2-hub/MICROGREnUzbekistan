import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { createSession, SESSION_COOKIE, sessionCookieOptions, sessionFingerprint } from '@/lib/session';
import { consume, reset, clientIp, tooManyRequests } from '@/lib/rateLimit';
import { audit } from '@/lib/audit';
import { Metrics } from '@/lib/metrics';

// ══════════════════════════════════════════════════════════════════════
// Вход сотрудника по PIN.
//
// Было: ни счётчика попыток, ни блокировки. PIN четырёхзначный — всего
// 10 000 комбинаций на всю базу сотрудников, то есть перебор упирался
// только в лимит nginx (10 r/s) и занимал меньше 20 минут. Успех при этом
// не выдавал никакого токена: клиент просто записывал имя в sessionStorage
// и дальше сам себе разрешал кассовые операции.
//
// Стало: лимит попыток на IP + подписанная сессия с ролью SELLER.
// ══════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs';

/** 5 попыток за 15 минут: перебор 10 000 комбинаций становится нереальным. */
const PIN_LIMIT = 5;
const PIN_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: NextRequest) {
  const ip = clientIp(request);

  try {
    const body = await request.json();
    const pin = String(body?.pin ?? '');

    if (!pin) {
      return NextResponse.json({ error: 'PIN majburiy' }, { status: 400 });
    }

    const limit = await consume(`pin:${ip}`, PIN_LIMIT, PIN_WINDOW_MS);
    if (!limit.ok) {
      audit({ action: 'pin.ratelimited', ip });
      Metrics.rateLimited('inventory/employees/auth');
      return tooManyRequests(limit.retryAfter);
    }

    const employee = await prisma.employee.findUnique({
      where: { pin },
      select: { id: true, name: true, role: true, isActive: true },
    });

    if (!employee || !employee.isActive) {
      audit({ action: 'pin.failed', ip });
      Metrics.loginFailed('pin');
      return NextResponse.json({ error: "PIN noto'g'ri" }, { status: 401 });
    }

    // Должность из карточки сотрудника решает, что он увидит. Поле `role`
    // существовало и раньше, но ни на что не влияло: любой сотрудник получал
    // SELLER и одну вкладку «Продажи», поэтому агроному, который ведёт
    // теплицу, показывать было нечего — посадки лежат под доступом владельца.
    const sessionRole = employee.role === 'grower' ? 'GROWER' : 'SELLER';

    const ua = request.headers.get('user-agent') ?? '';
    const fp = await sessionFingerprint(ip, ua);
    const token = await createSession({ role: sessionRole, name: employee.name, fp });
    if (!token) {
      return NextResponse.json(
        { error: "SESSION_SECRET sozlanmagan — kirish vaqtincha yopiq" },
        { status: 503 },
      );
    }

    await reset(`pin:${ip}`);
    Metrics.loginSuccess(sessionRole);
    audit({
      action: 'pin.success',
      actor: employee.name,
      role: sessionRole,
      ip,
      target: employee.id,
    });

    const res = NextResponse.json({
      success: true,
      employee: {
        id: employee.id,
        name: employee.name,
        role: employee.role,
      },
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

/** Выход из смены — гасит сессию продавца. */
export async function DELETE(request: NextRequest) {
  audit({ action: 'pin.logout', ip: clientIp(request) });
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(0), maxAge: 0 });
  return res;
}

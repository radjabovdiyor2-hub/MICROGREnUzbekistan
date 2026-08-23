import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';

import { audit } from '@/lib/audit';
import { Metrics } from '@/lib/metrics';
import { clientIp, consume, tooManyRequests } from '@/lib/rateLimit';
import { createSession, SESSION_COOKIE, sessionCookieOptions, sessionFingerprint } from '@/lib/session';
import { trustedBotTokens } from '@/lib/telegram/botTokens';
import { validateInitData } from '@/lib/telegramAuth';

// ══════════════════════════════════════════════════════════════════════
// Вход СОТРУДНИКА в админку из Telegram Mini App.
//
// ЗАЧЕМ
//
// Продавец работает в поле: двор ресторана, машина, дождь. Каждый вход в
// кассу стоил ему четырёхзначного PIN, набранного мокрыми руками на
// телефоне. При этом личность его Telegram уже доказана подписью — той
// самой, по которой владелец входит без пароля.
//
// ЧЕМ ОТЛИЧАЕТСЯ ОТ `/api/auth/telegram-admin`
//
// Тот выдаёт роль ADMIN и сверяет Telegram ID со списком владельцев в
// переменной окружения. Здесь роль берётся из КАРТОЧКИ СОТРУДНИКА:
// `employees.telegram_id` → `employees.role`. Список в переменных для
// этого не годится — сотрудники приходят и уходят, а трогать окружение
// ради нового продавца никто не станет.
//
// ПОЧЕМУ ЭТО НЕ ОСЛАБЛЯЕТ ДОСТУП
//
// Три условия сразу: подпись сошлась с токеном одного из наших ботов,
// Telegram ID найден в карточке, карточка активна. Уволенному достаточно
// снять галочку «активен» — и дверь закрывается тем же движением, что и
// PIN. Колонка `telegram_id` уникальна, поэтому один Telegram = один
// сотрудник.
//
// Владельцу здесь делать нечего: у него своя дверь, и роль ADMIN эта
// никогда не выдаёт — даже если владелец заведён и сотрудником.
// ══════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs';

/** Mini App переоткрывают часто, но не сотнями: 20 входов в час на адрес. */
const LIMIT = 20;
const WINDOW_MS = 60 * 60 * 1000;

/** Должность из карточки решает, что человек увидит. */
function sessionRoleOf(role: string): 'SELLER' | 'GROWER' {
  return role === 'grower' ? 'GROWER' : 'SELLER';
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const limit = await consume(`tgstaff:${ip}`, LIMIT, WINDOW_MS);
  if (!limit.ok) {
    Metrics.rateLimited('auth/telegram-staff');
    return tooManyRequests(limit.retryAfter);
  }

  let initData = '';
  try {
    const body = await request.json();
    initData = String(body?.initData ?? '');
  } catch {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }
  if (!initData) return NextResponse.json({ error: 'initData required' }, { status: 400 });

  const tokens = trustedBotTokens();
  if (!tokens.length) {
    // Отдельный текст: дело в настройке сервера, а не в аккаунте человека.
    return NextResponse.json({ error: 'Bot tokeni sozlanmagan' }, { status: 403 });
  }

  const verified = tokens
    .map((token) => validateInitData(initData, token))
    .find((result) => result.ok && result.user?.id);

  if (!verified?.user?.id) {
    audit({ action: 'login.telegram_staff.failed', ip });
    Metrics.loginFailed('telegram');
    return NextResponse.json({ error: 'invalid initData' }, { status: 401 });
  }

  const telegramId = BigInt(verified.user.id);
  const employee = await prisma.employee.findUnique({
    where: { telegramId },
    select: { id: true, name: true, role: true, isActive: true },
  });

  // Не найден и уволен отвечают ОДИНАКОВО: разный ответ подсказал бы
  // постороннему, что такой сотрудник в системе есть.
  if (!employee || !employee.isActive) {
    audit({ action: 'login.telegram_staff.denied', actor: String(verified.user.id), ip });
    Metrics.loginFailed('telegram');
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const role = sessionRoleOf(employee.role);
  const fp = await sessionFingerprint(ip, request.headers.get('user-agent') ?? '');
  const token = await createSession({ role, name: employee.name, fp });
  if (!token) {
    return NextResponse.json(
      { error: 'SESSION_SECRET sozlanmagan — kirish vaqtincha yopiq' },
      { status: 503 },
    );
  }

  audit({
    action: 'login.telegram_staff.success',
    actor: employee.name,
    role,
    ip,
    target: employee.id,
  });
  Metrics.loginSuccess(role);

  const res = NextResponse.json({ success: true, role });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}

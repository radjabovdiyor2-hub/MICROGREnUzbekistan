import { NextRequest, NextResponse } from 'next/server';
import { validateInitData } from '@/lib/telegramAuth';
import { trustedBotTokens } from '@/lib/telegram/botTokens';
import { createSession, SESSION_COOKIE, sessionCookieOptions, sessionFingerprint } from '@/lib/session';
import { consume, clientIp, tooManyRequests } from '@/lib/rateLimit';
import { audit } from '@/lib/audit';
import { Metrics } from '@/lib/metrics';

// ══════════════════════════════════════════════════════════════════════
// Вход владельца в админку из Telegram Mini App.
//
// ИИ-офис шлёт владельцу карточки «нужно ваше подтверждение» и дайджест
// «ждут вашего решения». Раньше это был текст без единой кнопки: чтобы
// посмотреть задачу или заказ, о которых спрашивают, надо было открыть
// сайт, вспомнить пароль и найти вкладку глазами. Теперь у карточки есть
// кнопка `web_app`, и админка открывается прямо внутри Telegram —
// личность владельца уже доказана подписью initData, пароль не нужен.
//
// Отличие от /api/auth/telegram-webapp: тот выдаёт сессию ПОКУПАТЕЛЯ
// любому пользователю Telegram. Здесь выдаётся роль ADMIN, поэтому:
//   · Telegram ID обязан быть в OWNER_TELEGRAM_IDS (тот же список, что
//     ADMIN_TELEGRAM_IDS у офиса — он решает, кому уходят карточки);
//   · нет списка или нет токена бота → 403, а не «пускаем всех».
//     Незаданная переменная не должна открывать админку — ровно так же
//     закрывается lib/session.ts без SESSION_SECRET.
//
// Подпись ставит тот бот, который открыл Mini App. Кнопки шлёт Стёпан, а
// не витринный бот, поэтому проверяем оба токена — иначе initData от
// Стёпана не сойдётся, и кнопка молча вела бы на экран пароля.
// ══════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs';

/** 20 входов в час на адрес: Mini App переоткрывают часто, но не сотнями. */
const LIMIT = 20;
const WINDOW_MS = 60 * 60 * 1000;

/** Telegram ID владельцев. Пусто — дверь закрыта. */
function ownerIds(): Set<string> {
  return new Set(
    (process.env.OWNER_TELEGRAM_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

/** Токены ботов, чью подпись принимаем. Список общий с входом сотрудника. */
const botTokens = trustedBotTokens;

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const limit = await consume(`tgadmin:${ip}`, LIMIT, WINDOW_MS);
  if (!limit.ok) {
    Metrics.rateLimited('auth/telegram-admin');
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

  const owners = ownerIds();
  const tokens = botTokens();
  if (!owners.size || !tokens.length) {
    // Отдельный текст, чтобы оператор понял: дело не в аккаунте, а в настройке.
    return NextResponse.json(
      { error: 'OWNER_TELEGRAM_IDS yoki bot tokeni sozlanmagan' },
      { status: 403 },
    );
  }

  const verified = tokens
    .map((token) => validateInitData(initData, token))
    .find((result) => result.ok && result.user?.id);

  if (!verified?.user?.id) {
    audit({ action: 'login.telegram.failed', actor: 'owner', ip });
    Metrics.loginFailed('telegram');
    return NextResponse.json({ error: 'invalid initData' }, { status: 401 });
  }

  const tg = verified.user;
  if (!owners.has(String(tg.id))) {
    audit({ action: 'login.telegram.denied', actor: String(tg.id), ip });
    Metrics.loginFailed('telegram');
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const fp = await sessionFingerprint(ip, request.headers.get('user-agent') ?? '');
  const name = [tg.first_name, tg.last_name].filter(Boolean).join(' ').trim();
  const token = await createSession({ role: 'ADMIN', name: name || undefined, fp });
  if (!token) {
    return NextResponse.json(
      { error: 'SESSION_SECRET sozlanmagan — kirish vaqtincha yopiq' },
      { status: 503 },
    );
  }

  audit({
    action: 'login.telegram.success',
    actor: 'owner',
    role: 'ADMIN',
    ip,
    target: String(tg.id),
  });
  Metrics.loginSuccess('ADMIN');

  const res = NextResponse.json({ success: true, role: 'ADMIN' });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}

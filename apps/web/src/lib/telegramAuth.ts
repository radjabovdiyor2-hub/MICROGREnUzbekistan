import crypto from 'crypto';

// ══════════════════════════════════════════════════════════════════════
// Проверка Telegram WebApp initData.
//
// Вынесено из /api/auth/telegram-webapp, потому что тем же способом должны
// подтверждать личность запросы на выгрузку и удаление персональных данных
// (§6.3 формы Due Diligence): без доказательства владения аккаунтом такой
// маршрут сам стал бы каналом утечки чужих данных.
//
// Алгоритм по документации Telegram:
//   secret = HMAC_SHA256("WebAppData", bot_token)
//   check  = HMAC_SHA256(secret, data_check_string) == hash
// ══════════════════════════════════════════════════════════════════════

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

export interface InitDataResult {
  ok: boolean;
  user?: TelegramUser | null;
}

/** Максимальный возраст payload — сутки, как в исходной реализации. */
const MAX_AGE_SECONDS = 86400;

export function validateInitData(initData: string, botToken: string): InitDataResult {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { ok: false };
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false };

  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SECONDS) return { ok: false };

  let user: TelegramUser | null = null;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch {
    user = null;
  }

  return { ok: true, user };
}

/** Токен бота из окружения — единая точка, чтобы имена переменных не разъезжались. */
export function getBotToken(): string | undefined {
  return process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
}

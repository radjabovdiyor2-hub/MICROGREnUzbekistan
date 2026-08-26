import { prisma } from '@repo/database';
import { SignJWT, importPKCS8 } from 'jose';

// ══════════════════════════════════════════════════════════════════════
// Push-уведомление покупателю.
//
// ЗАЧЕМ. У человека БЕЗ Telegram не было канала вовсе: статус заказа уходил
// только личным сообщением бота, и покупатель с сайта узнавал о доставке,
// когда курьер звонил в дверь.
//
// ШЛЁМ БЕЗ ПОЛЕЗНОЙ НАГРУЗКИ, и это осознанный выбор, а не упрощение.
// Шифрование payload по RFC 8291 требует ECDH и AES-GCM на каждое
// сообщение — то есть ещё одной зависимости в проекте либо сотни строк
// криптографии, которую некому проверять. Уведомление без тела разрешено
// стандартом: браузер будит страницу, а текст она дочитывает сама — тем же
// запросом и с той же сессией, что и обычный экран. Побочно это лучше для
// приватности: через службу доставки Google или Apple не проходит ничего,
// кроме факта «что-то произошло».
//
// БЕЗ КЛЮЧЕЙ VAPID ФУНКЦИЯ МОЛЧИТ. Так же, как Sentry без DSN: не задано —
// значит, возможность не подключена, и падать из-за этого нельзя.
// ══════════════════════════════════════════════════════════════════════

/** Сколько служба доставки хранит уведомление, если браузер офлайн. */
const TTL_SECONDS = 12 * 60 * 60;

/** Срок жизни подписи. Стандарт разрешает максимум сутки. */
const JWT_TTL_SECONDS = 12 * 60 * 60;

function keys(): { publicKey: string; privateKey: string; subject: string } | null {
  // Ключ СЕРВЕРНЫЙ, без префикса NEXT_PUBLIC_, и это не оплошность:
  // странице он приходит ответом `/api/push`, а не через бандл. Так его
  // можно поменять, не пересобирая сайт.
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    // `mailto:` обязателен по стандарту: службы доставки пишут по нему,
    // если с отправителем что-то не так.
    subject: process.env.VAPID_SUBJECT || 'mailto:info@microgreenuzbekistan.com',
  };
}

/** Ключ VAPID приходит в base64url без заголовков PEM — оборачиваем. */
function toPkcs8(base64url: string): string {
  const der = Buffer.from(base64url, 'base64url').toString('base64');
  const lines = der.match(/.{1,64}/g)?.join('\n') ?? der;
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----\n`;
}

/**
 * Подпись для одной службы доставки.
 *
 * `aud` — происхождение конкретного endpoint: подпись, выписанная для
 * Google, не годится для Apple, и это часть защиты, а не формальность.
 */
async function authHeader(endpoint: string): Promise<string | null> {
  const vapid = keys();
  if (!vapid) return null;

  try {
    const key = await importPKCS8(toPkcs8(vapid.privateKey), 'ES256');
    const jwt = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', typ: 'JWT' })
      .setAudience(new URL(endpoint).origin)
      .setSubject(vapid.subject)
      .setExpirationTime(`${JWT_TTL_SECONDS}s`)
      .sign(key);
    return `vapid t=${jwt}, k=${vapid.publicKey}`;
  } catch (error) {
    console.error('[push] подпись VAPID не собралась:', error);
    return null;
  }
}

/**
 * Разбудить все браузеры покупателя.
 *
 * Возвращает, скольким удалось. Протухшие подписки (404/410) удаляются
 * сразу: служба доставки говорит об этом прямо, и держать мёртвый адрес
 * значит каждый раз ходить в него зря.
 */
export async function pushToUser(userId: string): Promise<number> {
  if (!keys()) return 0;

  const subs = await prisma.pushSubscription.findMany({
    where: { userId },
    select: { id: true, endpoint: true },
  });
  if (subs.length === 0) return 0;

  let delivered = 0;
  for (const sub of subs) {
    const auth = await authHeader(sub.endpoint);
    if (!auth) return delivered;

    try {
      const res = await fetch(sub.endpoint, {
        method: 'POST',
        headers: {
          Authorization: auth,
          TTL: String(TTL_SECONDS),
          // Тела нет — служба доставки обязана знать это явно.
          'Content-Length': '0',
        },
      });

      if (res.status === 404 || res.status === 410) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        continue;
      }
      if (res.ok) {
        delivered += 1;
        await prisma.pushSubscription
          .update({ where: { id: sub.id }, data: { lastSeenAt: new Date() } })
          .catch(() => {});
      }
    } catch (error) {
      // Недоступная служба доставки — не повод ронять смену статуса заказа.
      console.error('[push] не доставлено:', error);
    }
  }
  return delivered;
}

/** Публичный ключ для страницы. Пусто — возможность не подключена. */
export function publicVapidKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

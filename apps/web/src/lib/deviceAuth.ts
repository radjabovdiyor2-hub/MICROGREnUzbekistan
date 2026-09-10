import crypto from 'crypto';

import { prisma } from '@repo/database';

// ══════════════════════════════════════════════════════════════════════
// Ключ устройства: третья дверь к треку.
//
// ДВЕ ПРЕЖНИЕ НЕ ГОДЯТСЯ ДЛЯ ПРИЛОЖЕНИЯ.
//   · Сессия живёт в браузере и истекает. Фоновая служба Android переживает
//     перезагрузку телефона и неделю без открытия приложения — ей нужен
//     ключ, который не протухает от того, что человек не заходил.
//   · Общий секрет бота открывает ВСЕ служебные двери разом. APK лежит у
//     людей на телефонах и разбирается любым желающим за десять минут;
//     класть туда `BOT_SECRET` нельзя ни при каких условиях.
//
// ЧТО МОЖЕТ ЭТОТ КЛЮЧ. Ровно две вещи: слать свой трек и читать/менять
// СВОЮ смену. Ни каталога, ни заказов, ни чужих дней. Владелец отзывает
// его по одному телефону, не трогая остальных.
//
// ХРАНИМ ТОЛЬКО ОТПЕЧАТОК. Сам ключ показывается один раз при выдаче;
// утёкшая база не должна давать доступ к треку живых людей.
// ══════════════════════════════════════════════════════════════════════

/** Приставка, по которой ключ узнаётся в логах и в чужих руках. */
export const DEVICE_TOKEN_PREFIX = 'mgd_';

/** Опознанный по ключу сотрудник. */
export interface DeviceHolder {
  employeeId: string;
  name: string;
  telegramId: bigint | null;
  tokenId: string;
}

/** Новый ключ. Возвращается ОДИН РАЗ — в базу уходит только отпечаток. */
export function mintToken(): { token: string; hash: string } {
  const token = DEVICE_TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Кто пришёл с этим ключом. `null` — ключа нет, отозван или человек уволен.
 *
 * Ищем по ОТПЕЧАТКУ, а не перебором: это индексный поиск по уникальной
 * колонке, и время ответа не зависит от того, сколько символов ключа
 * угадано. Сравнивать хэши в коде здесь не нужно и вредно.
 */
export async function deviceHolder(request: Request): Promise<DeviceHolder | null> {
  const bearer = request.headers.get('authorization') ?? '';
  if (!bearer.startsWith('Bearer ' + DEVICE_TOKEN_PREFIX)) return null;

  const token = bearer.slice('Bearer '.length);
  // Длина фиксирована выдачей: всё остальное — мусор или попытка подбора,
  // и ходить с ней в базу незачем.
  if (token.length < 20 || token.length > 128) return null;

  const row = await prisma.deviceToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      revokedAt: true,
      lastSeenAt: true,
      employee: { select: { id: true, name: true, telegramId: true, isActive: true } },
    },
  });
  if (!row || row.revokedAt !== null || !row.employee.isActive) return null;

  // «Был на связи» обновляем не чаще раза в десять минут: крошки приходят
  // раз в минуту, и запись на каждую — это лишняя тысяча обновлений в день
  // ради колонки, которую смотрят глазами.
  const now = Date.now();
  if (!row.lastSeenAt || now - row.lastSeenAt.getTime() > 10 * 60_000) {
    await prisma.deviceToken.update({
      where: { id: row.id },
      data: { lastSeenAt: new Date(now) },
    });
  }

  return {
    employeeId: row.employee.id,
    name: row.employee.name,
    telegramId: row.employee.telegramId,
    tokenId: row.id,
  };
}

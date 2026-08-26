import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@repo/database';
import { getCustomerId } from '@/lib/adminAuth';
import { parseBody } from '@/lib/api/parseBody';
import { publicVapidKey } from '@/lib/push/send';
import { clientIp, consume, tooManyRequests } from '@/lib/rateLimit';

// ══════════════════════════════════════════════════════════════════════
// Подписка браузера на уведомления о заказе.
//
// ЗАЧЕМ. У покупателя без Telegram канала не было вовсе: статус уходил
// только личным сообщением бота. Человек, оформивший заказ на сайте, узнавал
// о доставке, когда курьер звонил в дверь.
//
// ПОДПИСКА ПРИВЯЗАНА К ВОШЕДШЕМУ, и это не формальность: уведомление о
// заказе — личное. Без сессии подписывать некого, поэтому отвечаем 401, а
// не заводим ничью запись.
//
// GET отдаёт публичный ключ VAPID. Ключа нет — возможность не подключена, и
// страница честно не показывает кнопку, вместо того чтобы предлагать то,
// что не сработает.
// ══════════════════════════════════════════════════════════════════════

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

export async function GET() {
  const key = publicVapidKey();
  return NextResponse.json({ enabled: Boolean(key), publicKey: key });
}

export async function POST(request: NextRequest) {
  if (!publicVapidKey()) {
    return NextResponse.json({ error: 'Уведомления не настроены' }, { status: 501 });
  }

  const userId = getCustomerId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Нужен вход' }, { status: 401 });
  }

  // Подписка дешёвая, но не бесплатная: каждая — строка в базе и поход в
  // службу доставки при каждом статусе.
  const limit = await consume(`push:${clientIp(request)}`, 20, 60 * 60 * 1000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const parsed = await parseBody(request, subscribeSchema);
  if (!parsed.ok) return parsed.response;

  const { endpoint, keys } = parsed.data;

  try {
    // Повторная подписка того же браузера — это ОБНОВЛЕНИЕ, а не вторая
    // запись: браузер выдаёт новый endpoint при смене ключей, а прежний
    // сам протухнет и удалится при первой же отправке.
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userId,
        userAgent: request.headers.get('user-agent')?.slice(0, 255) ?? null,
      },
      update: { userId, p256dh: keys.p256dh, auth: keys.auth },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[push] подписка не сохранилась:', error);
    return NextResponse.json({ error: 'Не удалось подписаться' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const endpoint = request.nextUrl.searchParams.get('endpoint');
  if (!endpoint) {
    return NextResponse.json({ error: 'endpoint required' }, { status: 400 });
  }
  // Отписаться можно и без сессии: человек мог выйти, а уведомления
  // продолжали бы приходить на его браузер.
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  return NextResponse.json({ success: true });
}

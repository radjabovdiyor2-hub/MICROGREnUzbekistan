import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { validateInitData, getBotToken } from '@/lib/telegramAuth';
import { consume, clientIp, tooManyRequests } from '@/lib/rateLimit';
import { audit } from '@/lib/audit';

// ══════════════════════════════════════════════════════════════════════
// Права субъекта персональных данных (DD §6.3, Закон РУз «О персональных
// данных», ст. 20 — право на доступ и удаление).
//
// Форма Due Diligence отвечала на этот пункт только про шифрование канала
// и локальное хранение. Механизма, которым пользователь может ЗАБРАТЬ свои
// данные или потребовать их УДАЛЕНИЯ, не существовало.
//
// Личность подтверждается подписанным Telegram initData — тем же способом,
// что и вход в Mini App. Иначе этот маршрут сам стал бы утечкой.
//
// POST { initData, action: 'export' }  → все данные пользователя в JSON
// POST { initData, action: 'delete' }  → обезличивание (см. ниже)
// ══════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs';

/** 5 обращений в час: выгрузка тяжёлая, а удаление необратимо. */
const LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const limit = await consume(`userdata:${ip}`, LIMIT, WINDOW_MS);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  let body: { initData?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }

  const botToken = getBotToken();
  if (!botToken) {
    return NextResponse.json({ error: 'bot token not configured' }, { status: 500 });
  }
  if (!body.initData) {
    return NextResponse.json({ error: 'initData required' }, { status: 400 });
  }

  const { ok, user: tg } = validateInitData(body.initData, botToken);
  if (!ok || !tg?.id) {
    return NextResponse.json({ error: 'invalid initData' }, { status: 401 });
  }

  const telegramId = BigInt(tg.id);
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) {
    return NextResponse.json({ error: 'user not found' }, { status: 404 });
  }

  // ── Выгрузка ────────────────────────────────────────────────────────
  if (body.action === 'export') {
    const [orders, reviews, addresses] = await Promise.all([
      prisma.order.findMany({
        where: { userId: user.id },
        include: { items: { include: { product: { select: { nameUz: true, nameRu: true } } } } },
      }),
      prisma.review.findMany({ where: { userId: user.id } }),
      prisma.address.findMany({ where: { userId: user.id } }),
    ]);

    audit({ action: 'gdpr.export', actor: user.id, ip, target: String(tg.id) });

    // BigInt не сериализуется в JSON — приводим к строке явно.
    const payload = JSON.parse(
      JSON.stringify({ profile: user, orders, reviews, addresses }, (_k, v) =>
        typeof v === 'bigint' ? v.toString() : v,
      ),
    );

    return NextResponse.json(payload, {
      headers: {
        'Content-Disposition': `attachment; filename="microgreen-data-${tg.id}.json"`,
      },
    });
  }

  // ── Удаление ────────────────────────────────────────────────────────
  if (body.action === 'delete') {
    // Заказы не удаляем: они — первичный учётный документ, их хранение
    // требует налоговое законодательство. Вместо этого разрываем связь с
    // личностью: профиль обезличивается, персональные поля затираются.
    // Отзывы удаляем полностью — это публичный пользовательский контент.
    await prisma.$transaction([
      prisma.review.deleteMany({ where: { userId: user.id } }),
      prisma.address.deleteMany({ where: { userId: user.id } }),
      prisma.user.update({
        where: { id: user.id },
        data: {
          telegramId: null,
          firstName: 'Удалённый пользователь',
          lastName: null,
          username: null,
          phone: null,
          avatarUrl: null,
       },
      }),
    ]);

    audit({ action: 'gdpr.delete', actor: user.id, ip, target: String(tg.id) });

    return NextResponse.json({
      success: true,
      message:
        'Shaxsiy ma\'lumotlaringiz o\'chirildi. Buyurtmalar tarixi hisob-kitob uchun ' +
        'shaxssizlantirilgan holda saqlanadi.',
    });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}

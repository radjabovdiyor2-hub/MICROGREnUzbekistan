import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';

// ══════════════════════════════════════════════════════════════════════
// Промокоды.
//
// Модель PromoCode и проверка при оформлении (lib/promo.ts) существовали
// с самого начала, а интерфейса не было вообще: создать код можно было
// только запросом в базу руками. Маркетинговая акция упиралась в SQL.
//
// Удаления нет намеренно: код, по которому уже сделали заказы, нужен для
// разбора истории. Отключение — через isActive.
// ══════════════════════════════════════════════════════════════════════

const CODE_RE = /^[A-Z0-9_-]{3,32}$/;

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const codes = await prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  const now = new Date();

  return NextResponse.json({
    status: 'ok',
    codes: codes.map(c => ({
      id: c.id,
      code: c.code,
      discountType: c.discountType,
      value: c.value,
      minSubtotal: c.minSubtotal,
      maxUses: c.maxUses,
      usedCount: c.usedCount,
      isActive: c.isActive,
      expiresAt: c.expiresAt,
      createdAt: c.createdAt,
      // Почему код не сработает, даже когда isActive=true.
      exhausted: c.maxUses != null && c.usedCount >= c.maxUses,
      expired: !!c.expiresAt && c.expiresAt < now,
    })),
  });
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
  }

  const code = String(body.code ?? '').trim().toUpperCase();
  if (!CODE_RE.test(code)) {
    return NextResponse.json(
      { error: 'Код: 3–32 символа, латиница в верхнем регистре, цифры, «-» и «_»' },
      { status: 400 },
    );
  }

  const discountType = body.discountType === 'fixed' ? 'fixed' : 'percent';
  const value = Math.floor(Number(body.value));
  if (!Number.isFinite(value) || value <= 0) {
    return NextResponse.json({ error: 'Размер скидки должен быть больше нуля' }, { status: 400 });
  }
  // Процент выше 100 обнулил бы заказ, а fixed сверх суммы отсекает lib/promo.ts.
  if (discountType === 'percent' && value > 100) {
    return NextResponse.json({ error: 'Процент скидки не может превышать 100' }, { status: 400 });
  }

  const minSubtotal = Math.max(0, Math.floor(Number(body.minSubtotal) || 0));
  const maxUsesRaw = body.maxUses == null || body.maxUses === '' ? null : Math.floor(Number(body.maxUses));
  if (maxUsesRaw != null && (!Number.isFinite(maxUsesRaw) || maxUsesRaw <= 0)) {
    return NextResponse.json({ error: 'Лимит применений должен быть больше нуля' }, { status: 400 });
  }
  const expiresAt = body.expiresAt ? new Date(String(body.expiresAt)) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return NextResponse.json({ error: 'Некорректная дата окончания' }, { status: 400 });
  }

  try {
    const created = await prisma.promoCode.create({
      data: {
        code,
        discountType,
        value,
        minSubtotal,
        maxUses: maxUsesRaw,
        expiresAt,
        isActive: body.isActive !== false,
      },
    });

    audit({
      action: 'promo.create', actor: 'owner', role: 'ADMIN',
      ip: request.headers.get('x-forwarded-for') ?? undefined,
      target: code, meta: { discountType, value, minSubtotal, maxUses: maxUsesRaw },
    });

    return NextResponse.json({ status: 'ok', promo: created });
  } catch (error: unknown) {
    if (typeof error === 'object' && error && (error as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Такой код уже существует' }, { status: 409 });
    }
    console.error('[promo] создание не удалось:', error);
    return NextResponse.json({ error: 'Не удалось создать промокод' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
  }

  const id = String(body.id ?? '');
  if (!id) return NextResponse.json({ error: 'Нужен id' }, { status: 400 });

  const data: Record<string, unknown> = {};
  if ('isActive' in body) data.isActive = !!body.isActive;
  if ('minSubtotal' in body) data.minSubtotal = Math.max(0, Math.floor(Number(body.minSubtotal) || 0));
  if ('maxUses' in body) {
    data.maxUses = body.maxUses == null || body.maxUses === ''
      ? null
      : Math.max(1, Math.floor(Number(body.maxUses)));
  }
  if ('expiresAt' in body) {
    data.expiresAt = body.expiresAt ? new Date(String(body.expiresAt)) : null;
  }

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: 'Нечего менять' }, { status: 400 });
  }

  const updated = await prisma.promoCode.update({ where: { id }, data });

  audit({
    action: 'promo.update', actor: 'owner', role: 'ADMIN',
    ip: request.headers.get('x-forwarded-for') ?? undefined,
    target: updated.code, meta: data,
  });

  return NextResponse.json({ status: 'ok', promo: updated });
}

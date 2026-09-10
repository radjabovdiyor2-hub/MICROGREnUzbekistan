import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@repo/database';
import { getSession } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';
import { mintToken } from '@/lib/deviceAuth';
import { safeError } from '@/lib/safeError';
import { resolveEmployee } from '@/lib/tracking/fieldDay';

// ══════════════════════════════════════════════════════════════════════
// Ключи устройств: выдать, показать список, отозвать.
//
// ЗАЧЕМ. Приложение на Android пишет трек, когда телефон в кармане и экран
// погашен. Сессия браузера для этого не годится — она истекает; общий
// секрет бота не годится тем более — он лежал бы в APK у всех на руках.
// Здесь выдаётся ключ на пару «человек + телефон».
//
// ВЫДАЁТ СЕБЕ САМ СОТРУДНИК, войдя по PIN. Это то же согласие действием,
// что и с трансляцией: приложение начинает писать не потому, что владелец
// что-то включил, а потому что человек вошёл в него сам.
//
// ОТЗЫВАЕТ ТОЛЬКО ВЛАДЕЛЕЦ. Уволился, потерял телефон, сменил аппарат —
// ключ гасится по подписи устройства, остальные продолжают работать.
//
// POST   { label } — выдать ключ. Показывается ОДИН РАЗ.
// GET             — список устройств (владельцу).
// DELETE ?id=     — отозвать (владельцу).
// ══════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Сколько ключей на человека. Больше — это забытые телефоны, а не работа. */
const MAX_PER_EMPLOYEE = 5;

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session || (session.role !== 'SELLER' && session.role !== 'ADMIN') || !session.name) {
      return NextResponse.json({ error: 'Войдите по PIN' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const label = String(body?.label ?? '').trim().slice(0, 80) || 'Телефон';

    // Кто это — из подписи, а не из тела: телу здесь верить нельзя ровно по
    // той же причине, по которой расстояние до клиента считает сервер.
    const employee = await resolveEmployee({ name: session.name });
    if ('error' in employee) {
      return NextResponse.json({ error: employee.error }, { status: 403 });
    }

    const live = await prisma.deviceToken.count({
      where: { employeeId: employee.id, revokedAt: null },
    });
    if (live >= MAX_PER_EMPLOYEE) {
      return NextResponse.json(
        { error: 'Слишком много устройств — попросите владельца отозвать старые' },
        { status: 409 },
      );
    }

    const { token, hash } = mintToken();
    await prisma.deviceToken.create({
      data: { employeeId: employee.id, tokenHash: hash, label, platform: 'android' },
    });

    audit({ action: 'device.issued', actor: session.name, target: label });

    // Ключ уходит ОДИН РАЗ и больше не показывается нигде: в базе только
    // отпечаток. Потерял — выдаётся новый, старый отзывается.
    return NextResponse.json({ status: 'ok', token, label });
  } catch (error: unknown) {
    console.error('API Auth Device POST Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    if (getSession(request)?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Только владельцу' }, { status: 403 });
    }

    const devices = await prisma.deviceToken.findMany({
      select: {
        id: true,
        label: true,
        platform: true,
        createdAt: true,
        lastSeenAt: true,
        revokedAt: true,
        employee: { select: { id: true, name: true } },
      },
      orderBy: [{ revokedAt: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });

    return NextResponse.json({ status: 'ok', devices });
  } catch (error: unknown) {
    console.error('API Auth Device GET Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = getSession(request);
    if (session?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Только владельцу' }, { status: 403 });
    }

    const id = request.nextUrl.searchParams.get('id') ?? '';
    if (!id) return NextResponse.json({ error: 'Не указано устройство' }, { status: 400 });

    // Строку НЕ удаляем: история «этот телефон писал трек до 5 сентября»
    // объясняет дыру в отчёте лучше, чем её отсутствие.
    const revoked = await prisma.deviceToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) {
      return NextResponse.json({ error: 'Устройство не найдено или уже отозвано' }, { status: 404 });
    }

    audit({ action: 'device.revoked', actor: session.name ?? 'owner', target: id });
    return NextResponse.json({ status: 'ok', revoked: revoked.count });
  } catch (error: unknown) {
    console.error('API Auth Device DELETE Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

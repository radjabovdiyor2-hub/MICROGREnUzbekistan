import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';

// ══════════════════════════════════════════════════════════════════════
// Просмотр журнала действий.
//
// Записи создаёт lib/audit.ts — здесь только чтение. Ручки на удаление
// или правку нет намеренно: журнал, который можно почистить из UI, не
// журнал. Историю подрезает ретенция на уровне БД, а не владелец.
// ══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const sp = request.nextUrl.searchParams;
  const action = sp.get('action')?.trim();
  const actor = sp.get('actor')?.trim();
  const q = sp.get('q')?.trim();
  const take = Math.min(Number(sp.get('take')) || 100, 500);
  const cursor = sp.get('cursor');

  const where: Record<string, unknown> = {};
  // Префикс, а не точное совпадение: "settings" находит settings.update.
  if (action) where.action = { startsWith: action };
  if (actor) where.actor = { contains: actor, mode: 'insensitive' };
  if (q) {
    where.OR = [
      { action: { contains: q, mode: 'insensitive' } },
      { target: { contains: q, mode: 'insensitive' } },
      { actor: { contains: q, mode: 'insensitive' } },
    ];
  }

  try {
    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: { id: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: BigInt(cursor) }, skip: 1 } : {}),
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    return NextResponse.json({
      status: 'ok',
      // BigInt не сериализуется в JSON — отдаём строкой, она же курсор.
      entries: page.map(r => ({
        id: String(r.id),
        ts: r.ts,
        action: r.action,
        actor: r.actor,
        role: r.role,
        ip: r.ip,
        target: r.target,
        meta: r.meta,
      })),
      nextCursor: hasMore ? String(page[page.length - 1].id) : null,
    });
  } catch (error) {
    console.error('[audit] чтение журнала не удалось:', error);
    return NextResponse.json(
      { status: 'error', error: 'Не удалось прочитать журнал аудита из базы данных' },
      { status: 503 },
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';

// ══════════════════════════════════════════════════════════════════════
// Очередь заявок, ждущих решения владельца.
//
// Заявки жили в Redis с TTL 15 минут: не нажал за четверть часа — намерение
// исчезало, задача навсегда оставалась в `todo`, и увидеть «что от меня
// ждут» было негде вообще. Теперь источник правды — таблица
// `owner_approvals`, и этот роут показывает её содержимое.
//
// Одобрять отсюда НЕЛЬЗЯ намеренно: выполнение заявки живёт в офисе
// (`shared/approvals.py::_HANDLERS`), у витрины нет ни инструментов, ни
// шины. Кнопка ✅ — в Telegram, где карточка и пришла. Здесь — список
// и возможность снять то, что уже неактуально.
// ══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const showAll = new URL(request.url).searchParams.get('all') === '1';

  const approvals = await prisma.ownerApproval.findMany({
    where: showAll ? {} : { status: 'pending' },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const pendingCount = await prisma.ownerApproval.count({ where: { status: 'pending' } });

  return NextResponse.json({
    status: 'ok',
    pendingCount,
    approvals: approvals.map(a => ({
      id: a.id,
      kind: a.kind,
      summary: a.summary,
      botName: a.botName,
      status: a.status,
      remindCount: a.remindCount,
      createdAt: a.createdAt,
      decidedAt: a.decidedAt,
    })),
  });
}

/** DELETE — снять заявку, которая больше не актуальна (не выполняя её). */
export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Нужен числовой id' }, { status: 400 });
  }

  try {
    // Отмена, а не удаление строки: заявка — это след намерения бота, и
    // история решений владельца ценнее чистоты таблицы. Пометка `rejected`
    // выводит её из очереди и из напоминаний.
    const removed = await prisma.ownerApproval.update({
      where: { id },
      data: { status: 'rejected', decidedAt: new Date() },
    });
    audit({
      action: 'approval.reject', actor: 'owner', role: 'ADMIN',
      ip: request.headers.get('x-forwarded-for') ?? undefined,
      target: `#${id}`, meta: { kind: removed.kind, bot: removed.botName },
    });
    return NextResponse.json({ status: 'ok' });
  } catch {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
  }
}

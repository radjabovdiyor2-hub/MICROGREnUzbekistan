import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';
import { officeFetch } from '@/lib/office/client';
import { publish } from '@/lib/realtime/bus';

// ══════════════════════════════════════════════════════════════════════
// Очередь заявок, ждущих решения владельца.
//
// Заявки жили в Redis с TTL 15 минут: не нажал за четверть часа — намерение
// исчезало, задача навсегда оставалась в `todo`, и увидеть «что от меня
// ждут» было негде вообще. Теперь источник правды — таблица
// `owner_approvals`, и этот роут показывает её содержимое.
//
// РЕШЕНИЕ ПРИНИМАЕТСЯ ЗДЕСЬ ЖЕ, А НЕ ТОЛЬКО В TELEGRAM
//
// Долгое время одобрять отсюда было нельзя: выполнение заявки живёт в
// офисе (`shared/approvals.py::_HANDLERS`), у витрины нет ни инструментов,
// ни шины. Владелец видел очередь «Ждёт решения» и мог лишь снять заявку —
// то есть весь цикл подтверждений упирался в мессенджер, и без телефона
// под рукой работа стояла.
//
// Теперь витрина не выполняет действие сама, а передаёт решение офису
// (`POST /api/admin/approvals/decide`) — той же функцией `approvals.decide`,
// которую зовёт кнопка в чате. Одноразовость держит условие
// `status = 'pending'` в UPDATE: одновременное нажатие здесь и в Telegram
// выполнит действие ровно раз, второй нажавший получит «уже обработана».
//
// DELETE остаётся: снять неактуальную заявку — это не «отклонить», а
// прибраться, и офису об этом знать незачем.
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

/** POST — решить заявку: выполнить или отказать. Работу делает офис. */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  let body: { id?: unknown; decision?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
  }

  const id = Number(body.id);
  const decision = String(body.decision ?? '');
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Нужен числовой id' }, { status: 400 });
  }
  if (decision !== 'approved' && decision !== 'rejected') {
    return NextResponse.json({ error: 'decision: approved | rejected' }, { status: 400 });
  }

  audit({
    action: decision === 'approved' ? 'approval.approve' : 'approval.reject',
    actor: 'owner', role: 'ADMIN',
    ip: request.headers.get('x-forwarded-for') ?? undefined,
    target: `#${id}`, meta: { via: 'web' },
  });

  const res = await officeFetch<{ acted?: boolean; message?: string; kind?: string }>(
    '/api/admin/approvals/decide',
    {
      method: 'POST',
      body: JSON.stringify({ id, decision }),
      // Заявка запускает настоящее действие: публикацию, рассылку, бэкап.
      // Ждём столько же, сколько «Пульт ИИ».
      timeoutMs: 100_000,
    },
  );

  if (!res.ok) {
    // 409 от офиса — «уже обработана»: это не сбой, и админка должна
    // сказать это словами, а не показать красную ошибку сервера.
    const already = res.status === 409;
    return NextResponse.json(
      { error: res.error, already },
      { status: already ? 409 : 502 },
    );
  }

  publish('tasks');
  return NextResponse.json({
    status: 'ok',
    acted: res.data?.acted ?? false,
    message: res.data?.message ?? '',
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
    publish('tasks');
    return NextResponse.json({ status: 'ok' });
  } catch {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
  }
}

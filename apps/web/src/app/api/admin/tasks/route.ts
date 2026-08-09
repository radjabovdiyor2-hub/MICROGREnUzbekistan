import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';
import { officeFetch } from '@/lib/office/client';

// ══════════════════════════════════════════════════════════════════════
// Задачи отделам.
//
// Вкладки отделов показывали задачи только на чтение: поставить задачу
// боту можно было исключительно из Telegram, написав Стёпану.
//
// Задача не просто пишется в таблицу — она уходит событием TASK_CREATED,
// на которое подписаны боты отделов. Без события строка в базе появилась
// бы, а исполнителя у неё не было бы (так уже было с department='operations').
// ══════════════════════════════════════════════════════════════════════

/**
 * Отделы, у которых есть слушатель TASK_CREATED.
 *
 * pm / operations / production / logistics своего бота НЕ имеют — их
 * принимает Стёпан (он же PM/COO). franchise отсутствует намеренно:
 * franchise_bot — планировщик суточных сводок и на задачи не подписан.
 */
const DEPARTMENTS = [
  'sales', 'support', 'finance', 'hr', 'marketing',
  'analytics', 'content', 'qa', 'rnd', 'devops',
  'pm', 'operations', 'production', 'logistics',
] as const;

const PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);
const STATUSES = new Set(['todo', 'in_progress', 'done', 'cancelled']);

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const sp = new URL(request.url).searchParams;
  const department = sp.get('department')?.trim();
  const status = sp.get('status')?.trim();

  const tasks = await prisma.task.findMany({
    where: {
      ...(department && department !== 'all' ? { department } : {}),
      ...(status && status !== 'all' ? { status } : {}),
    },
    orderBy: [{ status: 'asc' }, { deadline: 'asc' }, { id: 'desc' }],
    take: 200,
  });

  const counts = await prisma.task.groupBy({ by: ['status'], _count: { _all: true } });

  return NextResponse.json({
    status: 'ok',
    departments: DEPARTMENTS,
    stats: Object.fromEntries(counts.map(c => [c.status, c._count._all])),
    tasks: tasks.map(t => ({
      id: t.id,
      title: t.title,
      department: t.department,
      assignee: t.assignee,
      status: t.status,
      priority: t.priority,
      deadline: t.deadline ? t.deadline.toISOString().slice(0, 10) : null,
      description: t.description,
      createdAt: t.createdAt,
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

  const title = String(body.title ?? '').trim();
  if (!title) return NextResponse.json({ error: 'Укажите название задачи' }, { status: 400 });

  // Регистр приводим здесь: боты фильтруют по department.lower(), и задача
  // с 'QA' от них молча ускользала.
  const department = String(body.department ?? '').trim().toLowerCase();
  if (!DEPARTMENTS.includes(department as (typeof DEPARTMENTS)[number])) {
    return NextResponse.json(
      { error: `Отдел должен быть одним из: ${DEPARTMENTS.join(', ')}` },
      { status: 400 },
    );
  }

  const priority = String(body.priority ?? 'medium');
  if (!PRIORITIES.has(priority)) {
    return NextResponse.json({ error: 'Приоритет: low, medium, high или urgent' }, { status: 400 });
  }

  let deadline: Date | null = null;
  if (body.deadline) {
    deadline = new Date(String(body.deadline));
    if (Number.isNaN(deadline.getTime())) {
      return NextResponse.json({ error: 'Некорректный срок' }, { status: 400 });
    }
  }

  const task = await prisma.task.create({
    data: {
      title: title.slice(0, 500),
      department,
      priority,
      deadline,
      description: body.description ? String(body.description).slice(0, 5000) : null,
      assignee: body.assignee ? String(body.assignee).slice(0, 255) : null,
      status: 'todo',
    },
  });

  audit({
    action: 'task.create', actor: 'owner', role: 'ADMIN',
    ip: request.headers.get('x-forwarded-for') ?? undefined,
    target: `#${task.id}`, meta: { department, priority, title },
  });

  // Разбудить бота отдела. Задача уже сохранена, поэтому недоступность
  // офиса не откатывает её — но честно сообщаем, что исполнитель не
  // уведомлён, иначе владелец будет ждать реакции, которой не будет.
  const dispatch = await officeFetch('/api/admin/dispatch-task', {
    method: 'POST',
    body: JSON.stringify({
      task_id: task.id,
      title: task.title,
      department,
      priority,
      description: task.description ?? '',
      deadline: deadline ? deadline.toISOString().slice(0, 10) : null,
    }),
  });

  return NextResponse.json({
    status: 'ok',
    task,
    dispatched: dispatch.ok,
    ...(dispatch.ok ? {} : { warning: `Задача сохранена, но бот не уведомлён: ${dispatch.error}` }),
  });
}

export async function PATCH(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
  }

  const id = Number(body.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Нужен id' }, { status: 400 });

  const data: Record<string, unknown> = {};
  if ('status' in body) {
    const status = String(body.status);
    if (!STATUSES.has(status)) {
      return NextResponse.json({ error: 'Статус: todo, in_progress, done или cancelled' }, { status: 400 });
    }
    data.status = status;
  }
  if ('priority' in body) {
    const priority = String(body.priority);
    if (!PRIORITIES.has(priority)) {
      return NextResponse.json({ error: 'Некорректный приоритет' }, { status: 400 });
    }
    data.priority = priority;
  }
  if ('assignee' in body) data.assignee = body.assignee ? String(body.assignee).slice(0, 255) : null;

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: 'Нечего менять' }, { status: 400 });
  }

  try {
    const updated = await prisma.task.update({ where: { id }, data });
    audit({
      action: 'task.update', actor: 'owner', role: 'ADMIN',
      ip: request.headers.get('x-forwarded-for') ?? undefined,
      target: `#${id}`, meta: data,
    });
    return NextResponse.json({ status: 'ok', task: updated });
  } catch {
    return NextResponse.json({ error: 'Задача не найдена' }, { status: 404 });
  }
}

/**
 * Удалить задачу насовсем — одну (`?id=12`) или пачкой (`?ids=12,13,14`).
 *
 * Именно удалить, а не отменить: `cancelled` оставляет строку в таблице
 * навсегда, а разбирать приходится мусор — дубли одной и той же фразы и
 * задачи отделам, которых не существует. На `Task` в схеме не ссылается
 * ни одна связь, поэтому каскадов нет и удаление безопасно.
 */
export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const sp = new URL(request.url).searchParams;
  const ip = request.headers.get('x-forwarded-for') ?? undefined;

  const raw = sp.get('ids') ?? sp.get('id') ?? '';
  const ids = raw.split(',').map(part => Number(part.trim())).filter(Number.isInteger);

  if (!ids.length) {
    return NextResponse.json({ error: 'Нужен числовой id или ids' }, { status: 400 });
  }

  const { count } = await prisma.task.deleteMany({ where: { id: { in: ids } } });

  if (!count) {
    return NextResponse.json({ error: 'Задача не найдена' }, { status: 404 });
  }

  audit({
    action: 'task.delete', actor: 'owner', role: 'ADMIN', ip,
    target: ids.map(id => `#${id}`).join(', '), meta: { requested: ids.length, deleted: count },
  });

  // Расхождение показываем честно: часть задач мог удалить кто-то другой,
  // и молчаливое «ок» на половину операции ввело бы владельца в заблуждение.
  return NextResponse.json({
    status: 'ok',
    deleted: count,
    ...(count < ids.length ? { warning: `Удалено ${count} из ${ids.length}: остальных уже не было` } : {}),
  });
}

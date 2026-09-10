import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';
import { parseBody } from '@/lib/api/parseBody';
import { getNumber } from '@/lib/settings/store';
import { buildPayroll, type PayoutKind } from '@/lib/finance/payroll';
import { workedDays } from '@/lib/finance/shiftPay';

// ══════════════════════════════════════════════════════════════════════
// Зарплата: кто сколько уже взял и сколько предстоит выплатить.
//
// ЗАЧЕМ. Расходы категории `salary` в `finances` показывали, сколько ушло
// на зарплату за месяц, но не отвечали на вопрос владельца перед днём
// выплаты: сколько из этой суммы конкретный человек уже получил авансом.
// У расхода нет сотрудника — он связан только с заказом.
//
// GET    ?period=ГГГГ-ММ  — расчёт за период (по умолчанию текущий месяц)
// POST   { employeeId, amount, kind, period }  — записать выплату
// DELETE ?id=…            — удалить ошибочную запись
// ══════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic';

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const KINDS = ['ADVANCE', 'SALARY', 'BONUS', 'DEDUCTION'] as const;

const createSchema = z.object({
  employeeId: z.string().min(1).max(64),
  // Сумма всегда положительная: направление задаёт `kind`. Минус в базе
  // слишком легко потерять при суммировании, и удержание тихо
  // превращается в выплату.
  amount: z.number().int().positive().max(1_000_000_000),
  kind: z.enum(KINDS),
  period: z.string().regex(PERIOD_RE, 'Период в виде ГГГГ-ММ'),
  paidAt: z.string().datetime().optional(),
  note: z.string().trim().max(500).optional().nullable(),
});

/** Текущий месяц в виде ГГГГ-ММ по локальному времени. */
function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Границы месяца для выборки: с первого числа по первое число следующего. */
function periodRange(period: string): { gte: Date; lt: Date } {
  const [y, m] = period.split('-').map(Number);
  return { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const sp = new URL(request.url).searchParams;
  const asked = sp.get('period');
  const period = asked && PERIOD_RE.test(asked) ? asked : currentPeriod();

  const payday = await getNumber('payroll.payday' as never);

  const [employees, payouts, shifts] = await Promise.all([
    prisma.employee.findMany({
      select: { id: true, name: true, isActive: true, baseSalary: true, shiftRate: true },
      orderBy: { name: 'asc' },
    }),
    prisma.employeePayout.findMany({
      where: { period: periodRange(period) },
      orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
    }),
    // Смены за тот же период. Берём только начатые: назначенная в
    // графике, но не открытая — это план, а не работа, и превращать
    // расписание на месяц вперёд в зарплату вперёд нельзя.
    prisma.shift.findMany({
      where: { date: periodRange(period), startTime: { not: null } },
      select: { employeeId: true, date: true, type: true, startTime: true },
    }),
  ]);

  const payroll = buildPayroll(
    employees,
    payouts.map((p) => ({
      id: p.id,
      employeeId: p.employeeId,
      amount: p.amount,
      kind: p.kind as PayoutKind,
      period: p.period,
    })),
    period,
    new Date(),
    payday,
    workedDays(shifts),
  );

  return NextResponse.json({
    payroll,
    // Список движений отдаём отдельно: расчёт показывает итог, а владельцу
    // нужно видеть, из чего он сложился, и уметь удалить ошибку.
    payouts: payouts.map((p) => ({
      id: p.id,
      employeeId: p.employeeId,
      amount: p.amount,
      kind: p.kind,
      paidAt: p.paidAt,
      note: p.note,
    })),
  });
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const parsed = await parseBody(request, createSchema);
  if (!parsed.ok) return parsed.response;
  const { employeeId, amount, kind, period, paidAt, note } = parsed.data;

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, name: true },
  });
  if (!employee) {
    return NextResponse.json({ error: 'Сотрудник не найден' }, { status: 404 });
  }

  const [y, m] = period.split('-').map(Number);

  const created = await prisma.employeePayout.create({
    data: {
      employeeId,
      amount,
      kind,
      // Период храним первым числом месяца: выборка идёт диапазоном, и
      // произвольный день внутри месяца дал бы разные ключи для одного
      // и того же периода.
      period: new Date(y, m - 1, 1),
      ...(paidAt ? { paidAt: new Date(paidAt) } : {}),
      ...(note ? { note } : {}),
    },
  });

  audit({
    action: `payroll.${kind.toLowerCase()}`,
    actor: 'owner',
    role: 'ADMIN',
    ip: request.headers.get('x-forwarded-for') ?? undefined,
    target: `#${created.id}`,
    meta: { employee: employee.name, amount, period },
  });

  return NextResponse.json({ status: 'ok', payout: created });
}

export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Не указан id' }, { status: 400 });

  const existing = await prisma.employeePayout.findUnique({
    where: { id },
    include: { employee: { select: { name: true } } },
  });
  if (!existing) return NextResponse.json({ error: 'Запись не найдена' }, { status: 404 });

  await prisma.employeePayout.delete({ where: { id } });

  audit({
    action: 'payroll.delete',
    actor: 'owner',
    role: 'ADMIN',
    ip: request.headers.get('x-forwarded-for') ?? undefined,
    target: `#${id}`,
    meta: { employee: existing.employee.name, amount: existing.amount, kind: existing.kind },
  });

  return NextResponse.json({ status: 'ok' });
}

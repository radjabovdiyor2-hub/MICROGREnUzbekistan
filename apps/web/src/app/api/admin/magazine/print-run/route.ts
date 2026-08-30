// ════════════════════════════════════════════════════════════
// Счета за тираж номера.
//
// ПОЧЕМУ ЭТО БОЛЬШЕ НЕ КРОН. Роут лежал в `cron/print-run` и работал по
// расписанию вместе с конвейером, который собирал номера сам. Конвейера
// нет: номер верстается руками и выходит тогда, когда готов, — значит и
// счёт выставляется по вышедшему номеру, а не по календарю.
//
// Повторный запуск безопасен: по номеру, за который счёт уже выставлен,
// второй не создаётся.
// ════════════════════════════════════════════════════════════
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { parseBody } from '@/lib/api/parseBody';
import { computeOrder } from '@/lib/magazine/printPricing';

export const dynamic = 'force-dynamic';

const schema = z.object({ issueId: z.string().min(1) });

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;

  const issue = await prisma.magazineIssue.findUnique({
    where: { id: parsed.data.issueId },
    select: { id: true, number: true, isPublished: true, restaurantId: true },
  });
  if (!issue) return NextResponse.json({ error: 'Номер не найден' }, { status: 404 });
  if (!issue.isPublished) {
    return NextResponse.json({ error: 'Номер ещё не опубликован' }, { status: 409 });
  }

  // Номер, сделанный для заведения, печатается только ему; общий — всем,
  // у кого подписка активна.
  const subscriptions = await prisma.printSubscription.findMany({
    where: {
      status: 'active',
      ...(issue.restaurantId ? { restaurantId: issue.restaurantId } : {}),
    },
    select: { id: true, copiesPerIssue: true, pricePerCopy: true, unitCost: true },
  });

  const billed = await prisma.printOrder.findMany({
    where: { issueId: issue.id },
    select: { subscriptionId: true },
  });
  const already = new Set(billed.map((b) => b.subscriptionId));

  const fresh = subscriptions
    .filter((s) => !already.has(s.id))
    .map((s) => ({
      issueId: issue.id,
      subscriptionId: s.id,
      copies: s.copiesPerIssue,
      unitPrice: s.pricePerCopy,
      unitCost: s.unitCost,
      ...computeOrder(s.copiesPerIssue, s.pricePerCopy, s.unitCost),
      status: 'pending',
    }));

  const { count } = fresh.length
    ? await prisma.printOrder.createMany({ data: fresh })
    : { count: 0 };

  return NextResponse.json({
    ok: true,
    issue: issue.number,
    ordersCreated: count,
    subscriptions: subscriptions.length,
  });
}

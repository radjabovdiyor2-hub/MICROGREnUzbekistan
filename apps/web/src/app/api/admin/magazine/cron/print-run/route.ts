import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { computeOrder } from '@/lib/magazine/printPricing';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!isAuthorized(req)) return unauthorized();

  try {
    const edition = await prisma.magazineEdition.findFirst({
      orderBy: { weekNumber: 'desc' }
    });

    if (!edition) {
      return NextResponse.json({ error: 'Edition not found for next week' }, { status: 404 });
    }

    // 1. Find all active subscriptions
    const subscriptions = await prisma.printSubscription.findMany({
      where: { status: 'active' }
    });

    // ── Три запроса вместо трёх НА КАЖДУЮ ПОДПИСКУ ────────────────────
    //
    // Здесь стоял цикл, и в нём поиск выпуска, поиск существующего счёта и
    // создание нового — то есть до трёх походов в базу на подписчика, все
    // последовательные. Это был худший N+1 в проекте: тираж считают раз в
    // неделю по всей базе подписок сразу.
    //
    // Порядок тот же, что и был: берём готовые выпуски, отсеиваем те, по
    // которым счёт уже выставлен, и создаём остальные одной вставкой.
    const issues = await prisma.restaurantIssue.findMany({
      where: {
        editionId: edition.id,
        restaurantId: { in: subscriptions.map((s) => s.restaurantId) },
        status: { in: ['ready', 'published'] },
      },
      select: { id: true, restaurantId: true, webSlug: true },
    });
    const issueByRestaurant = new Map(issues.map((i) => [i.restaurantId, i]));

    const billed = await prisma.printOrder.findMany({
      where: { restaurantIssueId: { in: issues.map((i) => i.id) } },
      select: { restaurantIssueId: true },
    });
    const alreadyBilled = new Set(billed.map((b) => b.restaurantIssueId));

    const slugsToPrint: string[] = [];
    const newOrders: Parameters<typeof prisma.printOrder.createMany>[0]['data'] = [];

    for (const sub of subscriptions) {
      const issue = issueByRestaurant.get(sub.restaurantId);
      if (!issue) continue;

      if (!alreadyBilled.has(issue.id)) {
        newOrders.push({
          restaurantIssueId: issue.id,
          subscriptionId: sub.id,
          copies: sub.copiesPerIssue,
          unitPrice: sub.pricePerCopy,
          unitCost: sub.unitCost,
          ...computeOrder(sub.copiesPerIssue, sub.pricePerCopy, sub.unitCost),
          status: 'pending',
        });
      }

      slugsToPrint.push(issue.webSlug);
    }

    const { count: ordersCreated } = Array.isArray(newOrders) && newOrders.length
      ? await prisma.printOrder.createMany({ data: newOrders })
      : { count: 0 };

    return NextResponse.json({ 
      success: true, 
      edition: edition.weekNumber, 
      ordersCreated,
      slugs: slugsToPrint // Return slugs so the bot can generate PDFs
    });

  } catch (e: unknown) {
    console.error('[/api/admin/magazine/cron/print-run] POST:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

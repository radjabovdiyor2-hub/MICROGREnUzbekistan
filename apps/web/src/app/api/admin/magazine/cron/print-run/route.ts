import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { computeOrder } from '@/lib/magazine/printPricing';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

function getNextWeekNumber() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  const start = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return Math.ceil((d.getDay() + 1 + days) / 7);
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return unauthorized();

  try {
    const weekNumber = getNextWeekNumber();
    
    const edition = await prisma.magazineEdition.findUnique({
      where: { weekNumber }
    });

    if (!edition) {
      return NextResponse.json({ error: 'Edition not found for next week' }, { status: 404 });
    }

    // 1. Find all active subscriptions
    const subscriptions = await prisma.printSubscription.findMany({
      where: { status: 'active' }
    });

    const slugsToPrint: string[] = [];
    let ordersCreated = 0;

    for (const sub of subscriptions) {
      // 2. Find the ready issue for this restaurant
      const issue = await prisma.restaurantIssue.findUnique({
        where: { editionId_restaurantId: { editionId: edition.id, restaurantId: sub.restaurantId } }
      });

      if (issue && (issue.status === 'ready' || issue.status === 'published')) {
        // Prevent duplicate order
        const existingOrder = await prisma.printOrder.findFirst({
          where: { restaurantIssueId: issue.id }
        });

        if (!existingOrder) {
          const pricing = computeOrder(sub.copiesPerIssue, sub.pricePerCopy, sub.unitCost);
          
          await prisma.printOrder.create({
            data: {
              restaurantIssueId: issue.id,
              subscriptionId: sub.id,
              copies: sub.copiesPerIssue,
              unitPrice: sub.pricePerCopy,
              unitCost: sub.unitCost,
              ...pricing,
              status: 'pending'
            }
          });
          
          ordersCreated++;
        }

        slugsToPrint.push(issue.webSlug);
      }
    }

    return NextResponse.json({ 
      success: true, 
      edition: edition.weekNumber, 
      ordersCreated,
      slugs: slugsToPrint // Return slugs so the bot can generate PDFs
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

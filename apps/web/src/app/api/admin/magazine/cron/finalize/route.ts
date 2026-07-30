import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!isAuthorized(req)) return unauthorized();

  try {
    const edition = await prisma.magazineEdition.findFirst({
      where: { isPublished: false },
      orderBy: { weekNumber: 'desc' }
    });

    if (!edition) {
      return NextResponse.json({ error: 'Edition not found for next week' }, { status: 404 });
    }

    // Publish the edition
    await prisma.magazineEdition.update({
      where: { id: edition.id },
      data: { isPublished: true }
    });

    // Mark all drafts as ready
    const res = await prisma.restaurantIssue.updateMany({
      where: { 
        editionId: edition.id,
        status: 'draft' 
      },
      data: { status: 'ready' }
    });

    return NextResponse.json({ 
      success: true, 
      edition: edition.weekNumber, 
      finalizedIssues: res.count 
    });

  } catch (e: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';

function getNextWeekNumber() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  const start = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return Math.ceil((d.getDay() + 1 + days) / 7);
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('x-bot-secret');
  if (authHeader !== process.env.BOT_SECRET) {
    return NextResponse.json({ error: 'Unauthorized cron' }, { status: 401 });
  }

  try {
    const weekNumber = getNextWeekNumber();
    
    const edition = await prisma.magazineEdition.findUnique({
      where: { weekNumber }
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
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

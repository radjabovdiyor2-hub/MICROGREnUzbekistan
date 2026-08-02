import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { prisma } from '@repo/database';

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const sp = new URL(request.url).searchParams;
  const employeeId = sp.get('employeeId');
  const month = sp.get('month'); // YYYY-MM

  const where: Record<string, unknown> = {};
  if (employeeId) where.employeeId = employeeId;
  
  if (month) {
    const from = new Date(`${month}-01T00:00:00Z`);
    const to = new Date(from);
    to.setMonth(to.getMonth() + 1);
    where.date = { gte: from, lt: to };
  }

  const shifts = await prisma.shift.findMany({
    where,
    orderBy: { date: 'desc' },
    include: { employee: { select: { name: true, department: true } } }
  });

  return NextResponse.json({ shifts });
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const body = await request.json();
    const { employeeId, date, startTime, endTime, type, note } = body;

    if (!employeeId || !date) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const shift = await prisma.shift.create({
      data: {
        employeeId,
        date: new Date(date),
        startTime: startTime ? new Date(startTime) : null,
        endTime: endTime ? new Date(endTime) : null,
        type: type || 'work',
        note,
      },
    });

    return NextResponse.json({ success: true, shift });
  } catch (error) {
    console.error('Error creating shift:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    }

    if (data.date) data.date = new Date(data.date);
    if (data.startTime) data.startTime = new Date(data.startTime);
    if (data.endTime) data.endTime = new Date(data.endTime);

    const shift = await prisma.shift.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true, shift });
  } catch (error) {
    console.error('Error updating shift:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    }

    await prisma.shift.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting shift:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

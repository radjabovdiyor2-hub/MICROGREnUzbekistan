import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { prisma, Prisma } from '@repo/database';

const isValidDate = (d: unknown) => d instanceof Date && !isNaN(d.getTime());

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const sp = new URL(request.url).searchParams;
  const employeeId = sp.get('employeeId');
  const month = sp.get('month'); // YYYY-MM

  const where: Record<string, unknown> = {};
  if (employeeId) where.employeeId = employeeId;
  
  if (month) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'Invalid month format, expected YYYY-MM' }, { status: 400 });
    }
    const from = new Date(`${month}-01T00:00:00Z`);
    if (!isValidDate(from)) {
      return NextResponse.json({ error: 'Invalid date resulting from month' }, { status: 400 });
    }
    const to = new Date(from);
    to.setMonth(to.getMonth() + 1);
    where.date = { gte: from, lt: to };
  }

  try {
    const shifts = await prisma.shift.findMany({
      where,
      orderBy: { date: 'desc' },
      include: { employee: { select: { name: true, department: true } } }
    });

    return NextResponse.json({ shifts });
  } catch (error) {
    console.error('Error fetching shifts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    let body;
    try {
      body = await request.json();
    } catch (_e) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { employeeId, date, startTime, endTime, type, note } = body;

    if (!employeeId || !date) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const shiftDate = new Date(date);
    if (!isValidDate(shiftDate)) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
    }

    const parsedStartTime = startTime ? new Date(startTime) : null;
    if (parsedStartTime !== null && !isValidDate(parsedStartTime)) {
      return NextResponse.json({ error: 'Invalid startTime format' }, { status: 400 });
    }

    const parsedEndTime = endTime ? new Date(endTime) : null;
    if (parsedEndTime !== null && !isValidDate(parsedEndTime)) {
      return NextResponse.json({ error: 'Invalid endTime format' }, { status: 400 });
    }

    if (parsedStartTime && parsedEndTime && parsedStartTime >= parsedEndTime) {
      return NextResponse.json({ error: 'startTime must be before endTime' }, { status: 400 });
    }

    const shift = await prisma.shift.create({
      data: {
        employeeId,
        date: shiftDate,
        startTime: parsedStartTime,
        endTime: parsedEndTime,
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
    let body;
    try {
      body = await request.json();
    } catch (_e) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { id, employeeId, date, startTime, endTime, type, note } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    }

    // Именно `UncheckedUpdateInput`, а не `Record<string, unknown>`: смена
    // задаётся плоским `employeeId`, а не `employee: { connect }`. Нетипизированный
    // объект Prisma принимала лишь потому, что `Record<string, unknown>` подходит
    // подо что угодно — опечатка в имени поля молча не доехала бы до базы.
    const updateData: Prisma.ShiftUncheckedUpdateInput = {};

    if (employeeId !== undefined) updateData.employeeId = employeeId;
    if (type !== undefined) updateData.type = type;
    if (note !== undefined) updateData.note = note;

    if (date !== undefined) {
      const shiftDate = new Date(date);
      if (!isValidDate(shiftDate)) return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
      updateData.date = shiftDate;
    }

    if (startTime !== undefined) {
      if (startTime === null) {
        updateData.startTime = null;
      } else {
        const parsedStart = new Date(startTime);
        if (!isValidDate(parsedStart)) return NextResponse.json({ error: 'Invalid startTime format' }, { status: 400 });
        updateData.startTime = parsedStart;
      }
    }

    if (endTime !== undefined) {
      if (endTime === null) {
        updateData.endTime = null;
      } else {
        const parsedEnd = new Date(endTime);
        if (!isValidDate(parsedEnd)) return NextResponse.json({ error: 'Invalid endTime format' }, { status: 400 });
        updateData.endTime = parsedEnd;
      }
    }

    const shift = await prisma.shift.update({
      where: { id },
      data: updateData,
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

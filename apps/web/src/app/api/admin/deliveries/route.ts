import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { isAuthorized } from '@/lib/adminAuth';

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  
  const where: Record<string, unknown> = {};
  if (status) where.status = status;

  try {
    const routes = await prisma.deliveryRoute.findMany({
      where,
      include: {
        driver: true,
        stops: {
          include: {
            order: true
          },
          orderBy: {
            orderIndex: 'asc'
          }
        }
      },
      orderBy: {
        date: 'desc'
      }
    });
    return NextResponse.json(routes);
  } catch (error: unknown) {
    console.error('Error fetching delivery routes:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { driverId, date, stops } = body;
    
    // stops is an array of { address, phone, orderId, orderIndex, note }
    
    const route = await prisma.deliveryRoute.create({
      data: {
        driverId,
        date: new Date(date),
        stops: {
          create: stops?.map((s: { address: string; phone?: string; orderId?: string; orderIndex?: number; note?: string; }) => ({
            address: s.address,
            phone: s.phone,
            orderId: s.orderId,
            orderIndex: s.orderIndex || 0,
            note: s.note,
          })) || []
        }
      },
      include: {
        stops: true
      }
    });

    return NextResponse.json(route, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating route:', error);
    return NextResponse.json({ error: 'Failed to create route' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, driverId, status } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing route ID' }, { status: 400 });
    }

    const route = await prisma.deliveryRoute.update({
      where: { id },
      data: {
        driverId,
        status,
      }
    });

    return NextResponse.json(route);
  } catch (error: unknown) {
    console.error('Error updating route:', error);
    return NextResponse.json({ error: 'Failed to update route' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing route ID' }, { status: 400 });
  }

  try {
    await prisma.deliveryRoute.delete({
      where: { id }
    });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error deleting route:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { isAuthorized } from '@/lib/adminAuth';
import { LIST_LIMIT } from '@/lib/api/listLimit';

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const { searchParams } = new URL(request.url);
  const batchId = searchParams.get('batchId');
  const status = searchParams.get('status');
  
  const where: Record<string, unknown> = {};
  if (batchId) where.batchId = batchId;
  if (status) where.status = status;

  try {
    const qcs = await prisma.qualityControl.findMany({
      where,
      include: {
        batch: true,
        inspector: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: LIST_LIMIT,
    });
    return NextResponse.json(qcs);
  } catch (error: unknown) {
    console.error('Error fetching quality controls:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { batchId, inspectorId, status, defectType, notes, photoUrl } = body;
    
    if (!batchId) {
      return NextResponse.json({ error: 'Missing batchId' }, { status: 400 });
    }
    
    const qc = await prisma.qualityControl.create({
      data: {
        batchId,
        inspectorId,
        status: status || 'passed',
        defectType,
        notes,
        photoUrl
      }
    });

    return NextResponse.json(qc, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating quality control:', error);
    return NextResponse.json({ error: 'Failed to create QC' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, status, defectType, notes } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing QC ID' }, { status: 400 });
    }

    const qc = await prisma.qualityControl.update({
      where: { id },
      data: {
        status,
        defectType,
        notes
      }
    });

    return NextResponse.json(qc);
  } catch (error: unknown) {
    console.error('Error updating QC:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing QC ID' }, { status: 400 });
  }

  try {
    await prisma.qualityControl.delete({
      where: { id }
    });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error deleting QC:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}

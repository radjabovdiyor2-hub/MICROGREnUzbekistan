import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { isAuthorized } from '@/lib/adminAuth';
import { LIST_LIMIT } from '@/lib/api/listLimit';

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  
  const where: Record<string, unknown> = {};
  if (status) where.status = status;

  try {
    const exps = await prisma.experiment.findMany({
      where,
      include: {
        batch: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: LIST_LIMIT,
    });
    return NextResponse.json(exps);
  } catch (error: unknown) {
    console.error('Error fetching experiments:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    // `result` принимаем при создании: офис записывает завершённый опыт одним
    // вызовом, и без этого поля колонка «Результат» оставалась пустой всегда.
    const { batchId, title, hypothesis, result, status } = body;

    if (!title) {
      return NextResponse.json({ error: 'Missing title' }, { status: 400 });
    }

    const exp = await prisma.experiment.create({
      data: {
        batchId,
        title,
        hypothesis,
        result,
        status: status || 'ongoing'
      }
    });

    return NextResponse.json(exp, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating experiment:', error);
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, title, hypothesis, result, status } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing experiment ID' }, { status: 400 });
    }

    const exp = await prisma.experiment.update({
      where: { id },
      data: {
        title,
        hypothesis,
        result,
        status
      }
    });

    return NextResponse.json(exp);
  } catch (error: unknown) {
    console.error('Error updating experiment:', error);
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
    return NextResponse.json({ error: 'Missing experiment ID' }, { status: 400 });
  }

  try {
    await prisma.experiment.delete({
      where: { id }
    });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error deleting experiment:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}

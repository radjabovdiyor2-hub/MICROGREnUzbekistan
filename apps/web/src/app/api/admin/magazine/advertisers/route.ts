import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { LIST_LIMIT } from '@/lib/api/listLimit';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const advertisers = await prisma.advertiser.findMany({
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
    return NextResponse.json(advertisers);
  } catch (error: unknown) {
    console.error('[/api/admin/magazine/advertisers] GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const created = await prisma.advertiser.create({ data });
    return NextResponse.json(created);
  } catch (error: unknown) {
    console.error('[/api/admin/magazine/advertisers] POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const data = await request.json();
    const { id, ...updateData } = data;
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    const updated = await prisma.advertiser.update({
      where: { id },
      data: updateData,
    });
    return NextResponse.json(updated);
  } catch (error: unknown) {
    console.error('[/api/admin/magazine/advertisers] PATCH:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    await prisma.advertiser.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[/api/admin/magazine/advertisers] DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

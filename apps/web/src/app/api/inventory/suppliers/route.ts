import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';

// ==========================================
// Suppliers API — CRUD
// ==========================================

// GET — List all suppliers with stats
export async function GET(request: NextRequest) {
  // Удаление поставщика мягкое (isActive = false), но список этого не
  // учитывал — и «удалённый» поставщик возвращался при первом обновлении
  // страницы. Выглядело как неработающая кнопка, хотя данные были помечены.
  const includeInactive = new URL(request.url).searchParams.get('includeInactive') === '1';

  const suppliers = await prisma.supplier.findMany({
    where: includeInactive ? {} : { isActive: true },
    include: {
      stockMovements: {
        where: { type: 'IN' },
        select: { quantity: true, costPrice: true, createdAt: true },
      },
      debts: {
        where: { type: 'WE_OWE', isPaid: false },
        select: { amount: true, paidAmount: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const result = suppliers.map(s => {
    const totalDeliveries = s.stockMovements.length;
    const totalPurchased = s.stockMovements.reduce(
      (sum, m) => sum + Math.abs(m.quantity) * (m.costPrice || 0), 0
    );
    const currentDebt = s.debts.reduce(
      (sum, d) => sum + (d.amount - d.paidAmount), 0
    );
    const { stockMovements, debts, ...supplier } = s;

    return { ...supplier, totalDeliveries, totalPurchased, currentDebt };
  });

  return NextResponse.json({ suppliers: result });
}

// POST — Create supplier
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, phone, address, note } = body;

    if (!name) {
      return NextResponse.json({ error: "Nom majburiy" }, { status: 400 });
    }

    const supplier = await prisma.supplier.create({
      data: { name, phone: phone || null, address: address || null, note: note || null },
    });

    return NextResponse.json({ success: true, supplier });
  } catch (error) {
    console.error('Supplier create error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

// PUT — Update supplier
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json({ error: 'Supplier ID majburiy' }, { status: 400 });
    }

    const supplier = await prisma.supplier.update({ where: { id }, data });
    return NextResponse.json({ success: true, supplier });
  } catch (error) {
    console.error('Supplier update error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

// DELETE — Delete supplier
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Supplier ID majburiy' }, { status: 400 });
    }

    await prisma.supplier.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Supplier delete error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

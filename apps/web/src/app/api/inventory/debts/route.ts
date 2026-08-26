import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { LIST_LIMIT } from '@/lib/api/listLimit';

// ==========================================
// Debts API — Track who owes whom
// ==========================================

// GET — List debts with filters
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type'); // WHO_OWES_US | WE_OWE
  const status = searchParams.get('status'); // all | unpaid | overdue | paid

  const where: Record<string, unknown> = {};
  if (type) where.type = type;

  if (status === 'unpaid') where.isPaid = false;
  else if (status === 'paid') where.isPaid = true;
  else if (status === 'overdue') {
    where.isPaid = false;
    where.dueDate = { lt: new Date() };
  }

  const debts = await prisma.debt.findMany({
    where,
    include: {
      supplier: { select: { name: true, phone: true } },
    },
    orderBy: [{ isPaid: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    take: LIST_LIMIT,
  });

  // Calculate summaries
  const allDebts = await prisma.debt.findMany({
    where: { isPaid: false },
    select: { type: true, amount: true, paidAmount: true, dueDate: true },
  });

  const summary = {
    theyOweUs: allDebts.filter(d => d.type === 'WHO_OWES_US').reduce((s, d) => s + (d.amount - d.paidAmount), 0),
    weOwe: allDebts.filter(d => d.type === 'WE_OWE').reduce((s, d) => s + (d.amount - d.paidAmount), 0),
    overdue: allDebts.filter(d => d.dueDate && d.dueDate < new Date()).length,
    totalCount: allDebts.length,
  };

  return NextResponse.json({ debts, summary });
}

// POST — Create a new debt
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, personName, phone, amount, description, dueDate, supplierId } = body;

    if (!type || !personName || !amount) {
      return NextResponse.json({ error: "type, personName, amount majburiy" }, { status: 400 });
    }

    const debt = await prisma.debt.create({
      data: {
        type,
        personName,
        phone: phone || null,
        amount,
        paidAmount: 0,
        description: description || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        supplierId: supplierId || null,
        isPaid: false,
      },
    });

    return NextResponse.json({ success: true, debt });
  } catch (error) {
    console.error('Debt create error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

// PUT — Update debt or make a payment
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, payment, ...otherData } = body;

    if (!id) {
      return NextResponse.json({ error: 'Debt ID majburiy' }, { status: 400 });
    }

    // If payment — add to paidAmount
    if (payment && payment > 0) {
      const debt = await prisma.debt.findUnique({ where: { id } });
      if (!debt) {
        return NextResponse.json({ error: 'Qarz topilmadi' }, { status: 404 });
      }

      const newPaidAmount = debt.paidAmount + payment;
      const isPaid = newPaidAmount >= debt.amount;

      const updated = await prisma.debt.update({
        where: { id },
        data: {
          paidAmount: newPaidAmount,
          isPaid,
        },
      });

      return NextResponse.json({
        success: true,
        debt: updated,
        remaining: Math.max(0, debt.amount - newPaidAmount),
        isPaid,
      });
    }

    // Otherwise — general update
    const updated = await prisma.debt.update({ where: { id }, data: otherData });
    return NextResponse.json({ success: true, debt: updated });
  } catch (error) {
    console.error('Debt update error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

/**
 * DELETE — закрыть долг.
 *
 * Комментарий здесь обещал мягкое закрытие («soft: mark as paid»), а код
 * делал `prisma.debt.delete` — физическое удаление финансовой записи.
 * Долг — это история расчётов: кто сколько был должен и когда рассчитался.
 * Стирать её нельзя, поэтому теперь код делает то, что и было обещано.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Debt ID majburiy' }, { status: 400 });
    }

    const debt = await prisma.debt.findUnique({ where: { id } });
    if (!debt) {
      return NextResponse.json({ error: 'Qarz topilmadi' }, { status: 404 });
    }

    const closed = await prisma.debt.update({
      where: { id },
      data: { isPaid: true, paidAmount: debt.amount },
    });
    return NextResponse.json({ success: true, debt: closed });
  } catch (error) {
    console.error('Debt close error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

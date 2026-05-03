import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';

// ==========================================
// Employees API — Seller Management
// ==========================================

// GET — List employees with today's sales stats
export async function GET() {
  const employees = await prisma.employee.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  // Get today's sales per employee
  const todayMovements = await prisma.stockMovement.findMany({
    where: {
      type: 'OUT',
      reason: { startsWith: "Do'kon sotish" },
      createdAt: { gte: today, lte: endOfDay },
    },
    include: {
      product: { select: { price: true } },
    },
  });

  const result = employees.map(emp => {
    const empSales = todayMovements.filter(m => m.performedBy === emp.name);
    const todaySalesCount = empSales.length;
    const todayRevenue = empSales.reduce((s, m) => s + Math.abs(m.quantity) * m.product.price, 0);

    return { ...emp, pin: undefined, todaySalesCount, todayRevenue };
  });

  return NextResponse.json({ employees: result });
}

// POST — Create employee
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, pin, phone, role } = body;

    if (!name || !pin) {
      return NextResponse.json({ error: "Ism va PIN majburiy" }, { status: 400 });
    }

    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: "PIN 4 ta raqamdan iborat bo'lishi kerak" }, { status: 400 });
    }

    // Check PIN uniqueness
    const existing = await prisma.employee.findUnique({ where: { pin } });
    if (existing) {
      return NextResponse.json({ error: "Bu PIN allaqachon ishlatilmoqda" }, { status: 400 });
    }

    const employee = await prisma.employee.create({
      data: { name, pin, phone: phone || null, role: role || 'seller' },
    });

    return NextResponse.json({ success: true, employee: { ...employee, pin: undefined } });
  } catch (error) {
    console.error('Employee create error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

// PUT — Update employee
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json({ error: 'Employee ID majburiy' }, { status: 400 });
    }

    if (data.pin) {
      if (data.pin.length !== 4 || !/^\d{4}$/.test(data.pin)) {
        return NextResponse.json({ error: "PIN 4 ta raqamdan iborat bo'lishi kerak" }, { status: 400 });
      }
      const existing = await prisma.employee.findFirst({
        where: { pin: data.pin, id: { not: id } },
      });
      if (existing) {
        return NextResponse.json({ error: "Bu PIN allaqachon ishlatilmoqda" }, { status: 400 });
      }
    }

    const employee = await prisma.employee.update({ where: { id }, data });
    return NextResponse.json({ success: true, employee: { ...employee, pin: undefined } });
  } catch (error) {
    console.error('Employee update error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

// DELETE — Deactivate employee
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Employee ID majburiy' }, { status: 400 });
    }

    await prisma.employee.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Employee delete error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

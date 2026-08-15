import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { EMPLOYEE_ROLE_VALUES } from '@/components/admin/employeeOptions';

// ==========================================
// Employees API — Seller Management
// ==========================================

/**
 * Должность решает права: `grower` открывает теплицу, остальные — кассу.
 * Вход по PIN (`employees/auth`) сверяет строку РЕГИСТРОЗАВИСИМО, поэтому
 * «Grower» или «agronom» дали бы сотрудника с правами продавца и без единой
 * ошибки на экране — та же болезнь, что у `department` без `.lower()`.
 * Отказываем сразу, а не выясняем это при первом входе человека на смену.
 */
function badRole(role: unknown): NextResponse | null {
  if (role === undefined || role === null || role === '') return null;
  if (EMPLOYEE_ROLE_VALUES.includes(String(role))) return null;
  return NextResponse.json(
    { error: `Noma'lum lavozim: ${role}. Ruxsat etilgan: ${EMPLOYEE_ROLE_VALUES.join(', ')}` },
    { status: 400 },
  );
}

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

  // Продажи сотрудника за сегодня. Признак продажи тот же, что и в общем
  // реестре выручки (lib/revenue/salesLedger): движение расхода без привязки
  // к заказу и с зафиксированной ценой продажи.
  //
  // Раньше фильтр шёл по префиксу «Do'kon sotish», из-за чего продажи в долг
  // («Qarzga sotish») сотруднику не засчитывались вовсе, а выручка считалась
  // по СЕГОДНЯШНЕМУ прайсу вместо цены, по которой продали.
  const todayMovements = await prisma.stockMovement.findMany({
    where: {
      type: 'OUT',
      orderId: null,
      salePrice: { not: null },
      createdAt: { gte: today, lte: endOfDay },
    },
  });

  const result = employees.map(emp => {
    const empSales = todayMovements.filter(m => m.performedBy === emp.name);
    const todaySalesCount = empSales.length;
    const todayRevenue = empSales.reduce(
      (s, m) => s + Math.abs(m.quantity) * (m.salePrice ?? 0), 0,
    );

    return { ...emp, pin: undefined, todaySalesCount, todayRevenue };
  });

  return NextResponse.json({ employees: result });
}

// POST — Create employee
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // department и city раньше не читались вовсе: колонки в базе есть,
    // график смен их показывает, но заполнить их было нечем — у каждого
    // сотрудника отдел оставался пустым навсегда.
    const { name, pin, phone, role, department, city } = body;

    if (!name || !pin) {
      return NextResponse.json({ error: "Ism va PIN majburiy" }, { status: 400 });
    }

    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: "PIN 4 ta raqamdan iborat bo'lishi kerak" }, { status: 400 });
    }

    const roleError = badRole(role);
    if (roleError) return roleError;

    // Check PIN uniqueness
    const existing = await prisma.employee.findUnique({ where: { pin } });
    if (existing) {
      return NextResponse.json({ error: "Bu PIN allaqachon ishlatilmoqda" }, { status: 400 });
    }

    const employee = await prisma.employee.create({
      data: {
        name, pin,
        phone: phone || null,
        role: role || 'seller',
        department: department || null,
        ...(city ? { city: String(city) } : {}),
      },
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

    const roleError = badRole(data.role);
    if (roleError) return roleError;

    // Белый список полей: раньше тело разворачивалось целиком, и клиент мог
    // переписать любую колонку — включая isActive и totalSales.
    const allowed = ['name', 'pin', 'phone', 'role', 'department', 'city', 'isActive'];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in data) patch[key] = data[key] === '' ? null : data[key];
    }

    const employee = await prisma.employee.update({ where: { id }, data: patch });
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

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';

// ==========================================
// Employee Auth — PIN verification
// ==========================================

// POST — Verify employee PIN
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pin } = body;

    if (!pin) {
      return NextResponse.json({ error: 'PIN majburiy' }, { status: 400 });
    }

    const employee = await prisma.employee.findUnique({
      where: { pin },
      select: { id: true, name: true, role: true, isActive: true },
    });

    if (!employee || !employee.isActive) {
      return NextResponse.json({ error: "PIN noto'g'ri" }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      employee: {
        id: employee.id,
        name: employee.name,
        role: employee.role,
      },
    });
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

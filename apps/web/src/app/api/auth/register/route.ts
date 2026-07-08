import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { notifyOfficeCustomer } from '@/lib/office';

// Simple registration — no verification required
export async function POST(request: NextRequest) {
  try {
    const { name, phone } = await request.json();

    if (!name || !phone) {
      return NextResponse.json({ error: 'Name and phone required' }, { status: 400 });
    }

    // Clean phone number
    const cleanPhone = phone.replace(/\D/g, '').slice(-9);
    if (cleanPhone.length < 9) {
      return NextResponse.json({ error: 'Invalid phone' }, { status: 400 });
    }

    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || null;

    // Upsert by phone number
    const user = await prisma.user.upsert({
      where: { phone: cleanPhone },
      update: {
        firstName,
        lastName,
      },
      create: {
        phone: cleanPhone,
        firstName,
        lastName,
        language: 'uz',
      },
    });

    // Register/refresh the customer in the AI-office CRM (best-effort, idempotent).
    await notifyOfficeCustomer(user);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        bonusPoints: user.bonusPoints,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
        referralCode: user.referralCode,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    // Even if DB fails, return success for local-only auth
    return NextResponse.json({ success: true, user: null });
  }
}

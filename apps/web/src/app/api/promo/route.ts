import { NextRequest, NextResponse } from 'next/server';
import { validatePromo } from '@/lib/promo';

// ==========================================
// Promo codes — validate for checkout
// ==========================================

// POST — validate a code against the current cart subtotal
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const code = String(body.code || '').trim().toUpperCase();
    const subtotal = Number(body.subtotal) || 0;
    if (!code) {
      return NextResponse.json({ valid: false, error: 'Promokod kiritilmadi / Введите промокод' }, { status: 400 });
    }
    const result = await validatePromo(code, subtotal);
    return NextResponse.json(result, { status: result.valid ? 200 : 422 });
  } catch (error) {
    console.error('[Promo API] Error:', error);
    return NextResponse.json({ valid: false, error: 'Xatolik yuz berdi / Произошла ошибка' }, { status: 500 });
  }
}

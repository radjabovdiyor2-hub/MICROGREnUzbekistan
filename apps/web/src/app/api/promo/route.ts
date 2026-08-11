import { NextRequest, NextResponse } from 'next/server';
import { validatePromo } from '@/lib/promo';
import { consume, clientIp, tooManyRequests } from '@/lib/rateLimit';

// ══════════════════════════════════════════════════════════════════════
// Promo codes — validate for checkout
//
// Дверь отвечает «есть такой код или нет» и ничем не была ограничена: это
// перебор промокодов со скоростью сети. Коды короткие и человекочитаемые,
// так что подобрать действующий — вопрос минут.
//
// 20 попыток в минуту с адреса: живой покупатель вводит код один раз, от
// силы дважды, а перебор становится бессмысленно медленным.
// ══════════════════════════════════════════════════════════════════════

const LIMIT = 20;
const WINDOW_MS = 60_000;

// POST — validate a code against the current cart subtotal
export async function POST(request: NextRequest) {
  const limit = await consume(`promo:${clientIp(request)}`, LIMIT, WINDOW_MS);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

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

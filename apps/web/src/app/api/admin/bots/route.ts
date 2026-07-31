import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { officeFetch } from '@/lib/office/client';

// ══════════════════════════════════════════════════════════════════════
// Здоровье 13 ботов. Пульс живёт в Redis, до которого у витрины доступа
// нет, поэтому идём через ИИ-офис.
//
// Если офис не отвечает — это САМО ПО СЕБЕ важная новость (значит лежит
// весь ИИ-контур), поэтому отдаём ошибку явно, а не пустой список.
// ══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const res = await officeFetch<{ bots: unknown[]; alive: number; total: number }>('/api/admin/bots');

  if (!res.ok) {
    return NextResponse.json(
      { status: 'error', error: res.error, bots: [], alive: 0, total: 0 },
      { status: 503 },
    );
  }

  return NextResponse.json({ status: 'ok', ...res.data });
}

import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { officeFetch } from '@/lib/office/client';

// ══════════════════════════════════════════════════════════════════════
// Сводка по отделам ИИ-офиса.
//
// Было: при недоступности офиса роут отдавал success:true и жёстко
// прошитый список из десяти отделов с нулевой статистикой. Владелец
// видел рабочую сводку в момент, когда ИИ-контур лежал.
//
// Стало: недоступность офиса — это 503 и честная причина.
// ══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const res = await officeFetch<{ departments: unknown[] }>('/api/departments/summary', {
    timeoutMs: 3000,
  });

  if (!res.ok) {
    return NextResponse.json(
      { success: false, error: res.error, departments: [] },
      { status: 503 },
    );
  }

  return NextResponse.json(res.data);
}

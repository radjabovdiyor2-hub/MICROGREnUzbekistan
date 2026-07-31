import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { officeFetch } from '@/lib/office/client';

// ══════════════════════════════════════════════════════════════════════
// Карточка отдела ИИ-офиса.
//
// Было: при недоступности офиса роут отдавал success:true с выдуманным
// отделом — нулевая статистика и пустой список задач. Владелец видел
// «0 просрочено» и зелёный «Online», когда на самом деле лежал весь
// ИИ-контур. Выдуманные данные, поданные как настоящие, хуже ошибки.
//
// Стало: недоступность офиса возвращается как 503. Это само по себе
// важная новость — так же, как в /api/admin/bots.
// ══════════════════════════════════════════════════════════════════════

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthorized(request)) return unauthorized();

  const { id } = await params;

  const res = await officeFetch<{ department: unknown }>(`/api/department/${id}`, {
    timeoutMs: 3000,
  });

  if (!res.ok) {
    return NextResponse.json({ success: false, error: res.error }, { status: 503 });
  }

  return NextResponse.json(res.data);
}

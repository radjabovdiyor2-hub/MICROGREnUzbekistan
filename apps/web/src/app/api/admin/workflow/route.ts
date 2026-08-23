import { NextResponse, type NextRequest } from 'next/server';

import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { officeFetch } from '@/lib/office/client';

// ══════════════════════════════════════════════════════════════════════
// Состояние процессов (DAG) из ИИ-офиса.
//
// ДВА РУБЕЖА, А НЕ ОДИН
//
// Путь закрыт правилом `/api/admin` (access: ADMIN) в middleware, но своей
// проверки у роута не было — единственного во всей группе. Рубеж в роуте
// нужен не «на всякий случай»: правила в middleware перекрываются по самому
// длинному префиксу, и стоит однажды завести рядом более узкое правило со
// STAFF — эта дверь тихо откроется продавцу вместе с ним.
//
// ЕДИНЫЙ КЛИЕНТ ОФИСА
//
// Запрос шёл сырым `fetch` мимо `lib/office/client`: без `X-Ingest-Secret`,
// со своим таймаутом (точнее, без него вовсе) и со своей трактовкой отказа.
// Ровно из-за таких копий один из путей год выдавал недоступность офиса за
// успех. Дверь в офис одна — `officeFetch`.
// ══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const res = await officeFetch<Record<string, unknown>>('/api/workflow/state', {
    timeoutMs: 8000,
  });

  // Отказ передаём как отказ: экран «Процессы» обязан показать, что офис
  // недоступен, а не пустой холст, неотличимый от «процессов нет».
  if (!res.ok) {
    return NextResponse.json({ success: false, error: res.error }, { status: 502 });
  }

  return NextResponse.json(res.data);
}

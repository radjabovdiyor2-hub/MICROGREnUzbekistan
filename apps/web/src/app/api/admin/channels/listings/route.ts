import { NextRequest, NextResponse } from 'next/server';

import { linkCatalog } from '@/lib/channels/listings';

// ══════════════════════════════════════════════════════════════════════
// Связать каталог с каналом: POST /api/admin/channels/listings { code }
//
// Доступ закрыт правилом `/api/admin` (ADMIN) в middleware.
// ══════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  const body = await request.json();
  const code = typeof body.code === 'string' ? body.code : '';

  const report = await linkCatalog(code);
  if (!report) {
    return NextResponse.json(
      { error: 'Канал неизвестен или ещё не сохранён' },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, ...report });
}

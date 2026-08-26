import { NextRequest, NextResponse } from 'next/server';

import { buildReport, isReportType } from '@/lib/export/reports';

// ══════════════════════════════════════════════════════════════════════
// Выгрузка отчётов в CSV.
//
// Сборка самих отчётов живёт в `lib/export/reports`: здесь остаётся только
// разбор параметра и заголовки ответа. Раньше все запросы к базе и склейка
// строк лежали прямо в роуте, и добавление пятого отчёта означало правку
// файла, который и так делал слишком много.
//
// Доступ закрыт правилом `/api/inventory/export` (ADMIN) в middleware:
// это выгрузка клиентской базы и денег целиком.
// ══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const type = new URL(request.url).searchParams.get('type') || 'inventory';

  if (!isReportType(type)) {
    return NextResponse.json({ error: 'Unknown export type' }, { status: 400 });
  }

  const { filename, csv } = await buildReport(type);

  // BOM — чтобы Excel открыл UTF-8 как UTF-8, а не как кракозябры.
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse('\uFEFF' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}_${date}.csv"`,
    },
  });
}

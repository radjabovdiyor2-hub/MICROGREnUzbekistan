import { NextRequest, NextResponse } from 'next/server';
import { loadSales } from '@/lib/inventory/analyticsSales';
import { loadTopProducts } from '@/lib/inventory/analyticsTop';
import { loadCategories } from '@/lib/inventory/analyticsCategories';
import { loadWarnings } from '@/lib/inventory/analyticsWarnings';
import { loadForecast } from '@/lib/inventory/analyticsForecast';
import { loadAbcXyz } from '@/lib/inventory/analyticsAbcXyz';
import { loadHealth } from '@/lib/inventory/analyticsHealth';
import { loadRevenue } from '@/lib/inventory/analyticsRevenue';

// ══════════════════════════════════════════════════════════════════════
// Analytics API — Sales, Demand, Warnings
//
// Роут — диспетчер: разбирает ?section= и отдаёт результат. Сами расчёты
// живут в lib/inventory/analytics*, каждая секция считается независимо.
//
// Секции dashboard здесь больше нет. Раньше она была значением по
// умолчанию и, попадая в четыре ветки подряд, прогоняла запросы продаж,
// лидеров, категорий и предупреждений — а возвращала {section:'unknown'},
// потому что своего return у неё не было. Никто её и не звал: админка
// ходит за каждой секцией отдельно. Теперь неизвестная секция отвечает
// 400, не трогая базу.
// ══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const section = searchParams.get('section') || 'sales';
  const months = parseInt(searchParams.get('months') || '6');

  switch (section) {
    case 'sales':
      return NextResponse.json(await loadSales(months));
    case 'top':
      return NextResponse.json(await loadTopProducts());
    case 'categories':
      return NextResponse.json(await loadCategories());
    case 'warnings':
      return NextResponse.json(await loadWarnings());
    case 'forecast':
      return NextResponse.json(await loadForecast());
    case 'abcxyz':
      return NextResponse.json(await loadAbcXyz());
    case 'health':
      return NextResponse.json(await loadHealth());
    case 'revenue':
      return NextResponse.json(await loadRevenue(searchParams));
    default:
      return NextResponse.json({ error: `Неизвестная секция: ${section}` }, { status: 400 });
  }
}

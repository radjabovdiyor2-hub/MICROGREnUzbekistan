import { NextRequest, NextResponse } from 'next/server';

import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { loadDeliveryRoutes } from '@/lib/customers/deliveryRoutes';
import { safeError } from '@/lib/safeError';

// ══════════════════════════════════════════════════════════════════════
// Слой доставки: точки выгрузки и линия объезда на дату.
//
// Отдельный роут, а не флаг у карты клиентов: у этих слоёв разный срок
// жизни. Клиенты меняются неделями, маршрут — в течение дня, и склеивать
// их в один запрос значит либо перезапрашивать клиентов каждую минуту,
// либо показывать вчерашний маршрут.
// ══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (date && Number.isNaN(new Date(date).getTime())) {
      return NextResponse.json({ error: 'Некорректная дата' }, { status: 400 });
    }

    return NextResponse.json(await loadDeliveryRoutes(date ?? undefined));
  } catch (error: unknown) {
    console.error('API Admin Customers Map Delivery GET Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';

import { requireBotAuth } from '@/lib/botAuth';
import { normalizeChannelBody } from '@/lib/channels/adapters';
import { ingestChannelOrder } from '@/lib/channels/intake';

// ══════════════════════════════════════════════════════════════════════
// Заказ с площадки: POST /api/channels/<код>/orders
//
// Дверь одна на все каналы. Разбор чужого формата — в адаптере канала,
// создание заказа — в общей двери витрины (`createOrder`): здесь только
// подпись, разбор тела и превращение отказа в HTTP-ответ.
//
// Правило доступа стоит в `middleware.ts` (`/api/channels`, ADMIN), и
// планировщик с интегратором ходят сюда с `BOT_SECRET`. Проверка тут же
// повторена намеренно — как у `/api/products/export`: дверь, за которой
// создаются заказы, не должна зависеть от одного лишь совпадения
// префикса в таблице правил.
// ══════════════════════════════════════════════════════════════════════

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channel: string }> },
) {
  if (!requireBotAuth(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { channel } = await params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Тело запроса не разобрано как JSON' }, { status: 400 });
  }

  const normalized = normalizeChannelBody(channel, raw);
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error, details: normalized.details }, { status: 400 });
  }

  try {
    const result = await ingestChannelOrder(channel, normalized.order);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    // Повтор вебхука отвечает тем же номером и кодом 200: площадка обязана
    // увидеть успех, иначе она будет повторять доставку до бесконечности.
    return NextResponse.json({
      success: true,
      duplicate: result.duplicate,
      order: { id: result.orderId, orderNumber: result.orderNumber },
    });
  } catch (error) {
    console.error(`[channels] приём заказа канала «${channel}» упал:`, error);
    return NextResponse.json({ error: 'Заказ не принят' }, { status: 500 });
  }
}

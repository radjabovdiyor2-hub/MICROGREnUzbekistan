import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { isAuthorized } from '@/lib/adminAuth';
import { computeOrder } from '@/lib/magazine/printPricing';
import { LIST_LIMIT } from '@/lib/api/listLimit';

// Ссылки на онлайн-оплату тиража (Click/Payme). Референс print_<id> — колбэки
// оплаты (payments.ts findPayableByRef) распознают его и помечают PrintOrder оплаченным.
const CLICK_MERCHANT_ID = process.env.CLICK_MERCHANT_ID || '';
const CLICK_SERVICE_ID = process.env.CLICK_SERVICE_ID || '';
const PAYME_MERCHANT_ID = process.env.PAYME_MERCHANT_ID || '';

function buildPayLinks(id: string, revenue: number): { click: string | null; payme: string | null } | null {
  if (!revenue || revenue <= 0) return null;
  const ref = `print_${id}`;
  const click = (CLICK_MERCHANT_ID && CLICK_SERVICE_ID)
    ? `https://my.click.uz/services/pay?service_id=${CLICK_SERVICE_ID}&merchant_id=${CLICK_MERCHANT_ID}&amount=${revenue}&transaction_param=${ref}`
    : null;
  const payme = PAYME_MERCHANT_ID
    ? `https://checkout.paycom.uz/${Buffer.from(`m=${PAYME_MERCHANT_ID};ac.order_id=${ref};a=${revenue * 100}`).toString('base64')}`
    : null;
  return (click || payme) ? { click, payme } : null;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const isReport = req.nextUrl.searchParams.get('report') === '1';

    if (isReport) {
      const orders = await prisma.printOrder.findMany({
        where: { status: { not: 'cancelled' } }
      });
      const summary = orders.reduce((acc, order) => {
        acc.revenue += order.revenue;
        acc.cost += order.cost;
        acc.margin += order.margin;
        return acc;
      }, { revenue: 0, cost: 0, margin: 0 });
      return NextResponse.json(summary);
    }

    const orders = await prisma.printOrder.findMany({
      include: {
        // Номер и заведение, которому он печатается: в списке счёт узнают
        // по ним, а не по идентификатору.
        issue: { select: { number: true, titleRu: true, restaurant: { select: { name: true } } } },
        subscription: { include: { restaurant: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
    // К неоплаченным тиражам прикладываем ссылки на онлайн-оплату
    const withLinks = orders.map((o) => ({
      ...o,
      payLinks: o.status === 'paid' ? null : buildPayLinks(o.id, o.revenue),
    }));
    return NextResponse.json(withLinks);
  } catch (e: unknown) {
    console.error('[/api/admin/magazine/print-orders] GET:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const data = await req.json();
    const { issueId, subscriptionId, copies, unitPrice, unitCost } = data;

    const pricing = computeOrder(copies, unitPrice, unitCost);

    const order = await prisma.printOrder.create({
      data: {
        issueId,
        subscriptionId: subscriptionId || null,
        copies,
        unitPrice,
        unitCost: unitCost || 4000,
        ...pricing,
        status: data.status || 'pending',
      }
    });
    return NextResponse.json(order);
  } catch (e: unknown) {
    console.error('[/api/admin/magazine/print-orders] POST:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const data = await req.json();
    const id = String(data?.id ?? '');
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    // Закрытый список полей. Здесь стояло `data: updateData` — тело уходило
    // в базу целиком, и присланное `revenue` или `cost` переписывало
    // посчитанные суммы тиража. Менять у счёта можно ровно две вещи:
    // состояние счёта.
    const status = ['pending', 'printing', 'delivered', 'paid', 'cancelled'];
    const update: Record<string, unknown> = {};
    if (typeof data.status === 'string') {
      if (!status.includes(data.status)) {
        return NextResponse.json({ error: 'Неизвестный статус тиража' }, { status: 400 });
      }
      update.status = data.status;
      // Дата оплаты ставится ЗДЕСЬ, а не присылается: иначе счёт можно
      // отметить оплаченным задним числом любым днём.
      if (data.status === 'paid') update.paidAt = new Date();
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Нечего менять' }, { status: 400 });
    }

    const order = await prisma.printOrder.update({
      where: { id },
      data: update,
    });
    return NextResponse.json(order);
  } catch (e: unknown) {
    console.error('[/api/admin/magazine/print-orders] PATCH:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    await prisma.printOrder.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    console.error('[/api/admin/magazine/print-orders] DELETE:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

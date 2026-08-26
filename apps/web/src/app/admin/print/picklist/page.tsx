import { cookies } from 'next/headers';
import { prisma } from '@repo/database';

import { SESSION_COOKIE, verifySession } from '@/lib/session';
import '@/styles/picklist-print.css';
import { soldProductName } from '@/lib/products/sold';

import { PrintButton } from '../PrintButton';

// ══════════════════════════════════════════════════════════════════════
// Лист сборки заказов на день — первая печатная форма в проекте.
//
// ЗАЧЕМ. Печатных форм не было ни одной: ни накладной, ни счёта, ни списка
// на сборку. Утром зелень собирают руками, глядя в телефон и листая заказы
// по одному, — а в холодной комнате телефон в руке это буквально третья
// рука. Лист печатается и лежит рядом.
//
// ЧТО НА ЛИСТЕ. Сверху — СВОДКА ПО ТОВАРАМ: сколько всего чего срезать.
// Это главное число дня, и до сих пор его никто не считал: собирали по
// заказам и складывали в уме. Ниже — сами заказы с адресами, чтобы
// разложить по пакетам и не перепутать.
//
// Отменённые не печатаем: их не везут. Доставленные оставляем — лист
// открывают и в середине дня, и вычеркнутые строки помогают понять, что
// уже уехало.
// ══════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic';

/** Границы суток по местному времени: заказ в 23:30 — сегодняшний. */
function dayBounds(raw?: string): { from: Date; to: Date; label: string } {
  const base = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date();
  const from = new Date(base);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from, to, label: from.toLocaleDateString('ru-RU') };
}

export default async function PicklistPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  const allowed = session?.role === 'ADMIN' || session?.role === 'SELLER';

  if (!allowed) {
    return (
      <main style={{ padding: 32, fontFamily: 'system-ui' }}>
        <p>Нужен вход сотрудника.</p>
      </main>
    );
  }

  const { date } = await searchParams;
  const { from, to, label } = dayBounds(date);

  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: from, lt: to }, status: { not: 'CANCELLED' } },
    orderBy: { createdAt: 'asc' },
    select: {
      orderNumber: true, phone: true, address: true, note: true, status: true,
      items: {
        select: {
          quantity: true, productName: true,
          product: { select: { nameRu: true, nameUz: true, unit: true } },
        },
      },
    },
  });

  // Сводка «чего сколько срезать» — то самое число, которое до сих пор
  // складывали в уме.
  const totals = new Map<string, { qty: number; unit: string }>();
  for (const o of orders) {
    for (const i of o.items) {
      const name = soldProductName(i);
      const prev = totals.get(name);
      totals.set(name, {
        qty: (prev?.qty ?? 0) + i.quantity,
        unit: prev?.unit ?? i.product?.unit ?? 'шт',
      });
    }
  }
  const summary = [...totals.entries()].sort((a, b) => b[1].qty - a[1].qty);

  return (
    <main className="picklist">
      <header className="picklist__head">
        <div>
          <h1>Лист сборки</h1>
          <div className="picklist__date">{label} · заказов: {orders.length}</div>
        </div>
        <PrintButton />
      </header>

      {orders.length === 0 ? (
        <p>На этот день заказов нет.</p>
      ) : (
        <>
          <section>
            <h2>Всего срезать</h2>
            <table className="picklist__table">
              <tbody>
                {summary.map(([name, v]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td className="picklist__qty">{v.qty} {v.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h2>По заказам</h2>
            {orders.map((o) => (
              <article key={o.orderNumber} className="picklist__order">
                <div className="picklist__order-head">
                  <strong>#{o.orderNumber}</strong>
                  <span>{o.phone}</span>
                  <span className="picklist__status">{o.status}</span>
                </div>
                <div className="picklist__addr">{o.address || 'адрес не указан'}</div>
                {o.note && <div className="picklist__note">{o.note}</div>}
                <table className="picklist__table">
                  <tbody>
                    {o.items.map((i, n) => (
                      <tr key={n}>
                        <td>{soldProductName(i)}</td>
                        <td className="picklist__qty">{i.quantity} {i.product?.unit ?? 'шт'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </article>
            ))}
          </section>
        </>
      )}
    </main>
  );
}

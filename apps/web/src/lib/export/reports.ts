import { prisma } from '@repo/database';

import { soldProductName } from '@/lib/products/sold';

// ══════════════════════════════════════════════════════════════════════
// Выгрузки в CSV — сборка отчётов отдельно от роута.
//
// ЧТО ЗДЕСЬ ЧИНИТСЯ ПОПУТНО. Ячейки склеивались строкой в кавычках, а
// кавычка ВНУТРИ значения ничем не экранировалась: товар «Руккола "Экстра"»
// разваливал строку, и Excel читал остаток как новые колонки. Заметить это
// можно только по кривому файлу, поэтому склейка теперь в одном месте и по
// правилам RFC 4180 — удвоением кавычки.
//
// ЧЕГО НЕ ХВАТАЛО. Выгружались склад, долги, движения и продажи. Не
// выгружалось то, что чаще всего и просят унести в таблицу: клиенты,
// заказы и финансы. Отчёт, который нельзя открыть в Excel, для
// бухгалтера не существует.
// ══════════════════════════════════════════════════════════════════════

/** Ячейка CSV по RFC 4180: кавычка внутри значения удваивается. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const text = String(value).replace(/"/g, '""');
  return `"${text}"`;
}

/** Строка CSV из готовых значений. Числа не кавычим — Excel считает их числами. */
function row(cells: (string | number | null | undefined)[]): string {
  return cells
    .map((c) => (typeof c === 'number' && Number.isFinite(c) ? String(c) : csvCell(c)))
    .join(',') + '\n';
}

function dt(value: Date | null | undefined): string {
  return value ? value.toLocaleString('uz-UZ') : '-';
}

function d(value: Date | null | undefined): string {
  return value ? value.toLocaleDateString('uz-UZ') : '-';
}

export interface Report {
  filename: string;
  csv: string;
}

/** Сколько строк отдаём максимум: выгрузка не должна ронять память. */
const MAX_ROWS = 5000;

export const REPORT_TYPES = [
  'inventory', 'debts', 'movements', 'sales',
  'customers', 'orders', 'finance',
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export function isReportType(value: string): value is ReportType {
  return (REPORT_TYPES as readonly string[]).includes(value);
}

export async function buildReport(type: ReportType): Promise<Report> {
  switch (type) {
    case 'inventory': return inventory();
    case 'debts': return debts();
    case 'movements': return movements();
    case 'sales': return sales();
    case 'customers': return customers();
    case 'orders': return orders();
    case 'finance': return finance();
  }
}

async function inventory(): Promise<Report> {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    include: { category: { select: { nameUz: true } } },
    orderBy: { stock: 'asc' },
  });

  let csv = 'Tovar,Kategoriya,Narx,Omborda,Qiymat\n';
  for (const p of products) {
    csv += row([p.nameUz, p.category?.nameUz || '-', p.price, p.stock, p.stock * p.price]);
  }
  return { filename: 'ombor_hisobot', csv };
}

async function debts(): Promise<Report> {
  const rows = await prisma.debt.findMany({
    where: { isPaid: false },
    include: { supplier: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });

  let csv = "Turi,Ism,Telefon,Summa,To'langan,Qoldiq,Sana,Muddat\n";
  for (const x of rows) {
    csv += row([
      x.type === 'WHO_OWES_US' ? 'Bizga qarzdor' : 'Biz qarzdormiz',
      x.personName, x.phone || '-',
      x.amount, x.paidAmount, x.amount - x.paidAmount,
      d(x.createdAt), d(x.dueDate),
    ]);
  }
  return { filename: 'qarzlar_hisobot', csv };
}

async function movements(): Promise<Report> {
  const rows = await prisma.stockMovement.findMany({
    include: {
      product: { select: { nameUz: true } },
      supplier: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  let csv = 'Sana,Tovar,Turi,Miqdor,Sabab,Kim\n';
  for (const m of rows) {
    csv += row([dt(m.createdAt), soldProductName(m), m.type, m.quantity, m.reason || '-', m.performedBy || '-']);
  }
  return { filename: 'harakatlar_hisobot', csv };
}

async function sales(): Promise<Report> {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [online, pos] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: since }, status: { not: 'CANCELLED' } },
      include: {
        items: { include: { product: { select: { nameUz: true } } } },
        user: { select: { firstName: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.stockMovement.findMany({
      where: { type: 'OUT', reason: { startsWith: "Do'kon sotish" }, createdAt: { gte: since } },
      include: { product: { select: { nameUz: true, price: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  let csv = 'Sana,Turi,Raqam,Tovar,Miqdor,Narx,Jami,Kim\n';
  for (const o of online) {
    for (const item of o.items) {
      csv += row([
        dt(o.createdAt), 'Online', o.orderNumber, soldProductName(item),
        item.quantity, item.price, item.quantity * item.price,
        o.user?.firstName || o.phone || '-',
      ]);
    }
  }
  for (const m of pos) {
    const match = m.reason?.match(/\(S-[A-Z0-9-]+\)/);
    const price = m.product?.price ?? 0;
    const qty = Math.abs(m.quantity);
    csv += row([
      dt(m.createdAt), "Do'kon", match ? match[0].replace(/[()]/g, '') : '-',
      soldProductName(m), qty, price, qty * price, m.performedBy || '-',
    ]);
  }
  return { filename: 'sotishlar_hisobot', csv };
}

async function customers(): Promise<Report> {
  const rows = await prisma.customer.findMany({
    orderBy: { totalSpent: 'desc' },
    take: MAX_ROWS,
    select: {
      name: true, companyName: true, phone: true, customerType: true,
      status: true, district: true, city: true,
      ordersCount: true, totalSpent: true, lastOrderDate: true,
    },
  });

  let csv = 'Nomi,Kompaniya,Telefon,Turi,Holati,Tuman,Shahar,Buyurtmalar,Jami xarid,Oxirgi buyurtma\n';
  for (const c of rows) {
    csv += row([
      c.name || '-', c.companyName || '-', c.phone || '-',
      c.customerType || '-', c.status || '-', c.district || '-', c.city || '-',
      c.ordersCount ?? 0, Number(c.totalSpent ?? 0), d(c.lastOrderDate),
    ]);
  }
  return { filename: 'mijozlar_hisobot', csv };
}

async function orders(): Promise<Report> {
  const rows = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    take: MAX_ROWS,
    select: {
      orderNumber: true, createdAt: true, status: true, paymentStatus: true,
      paymentMethod: true, phone: true, address: true, city: true,
      subtotal: true, deliveryFee: true, discount: true, total: true,
    },
  });

  let csv = "Raqam,Sana,Holati,To'lov holati,To'lov usuli,Telefon,Manzil,Shahar,Summa,Yetkazish,Chegirma,Jami\n";
  for (const o of rows) {
    csv += row([
      o.orderNumber, dt(o.createdAt), o.status, o.paymentStatus, o.paymentMethod,
      o.phone, o.address || '-', o.city || '-',
      o.subtotal, o.deliveryFee, o.discount, o.total,
    ]);
  }
  return { filename: 'buyurtmalar_hisobot', csv };
}

async function finance(): Promise<Report> {
  // По деловой дате `date`, а не по времени записи: проводка, внесённая
  // задним числом, обязана попасть в свой день — на этом уже спотыкался
  // месячный P&L офиса.
  const rows = await prisma.finance.findMany({
    orderBy: { date: 'desc' },
    take: MAX_ROWS,
    select: {
      date: true, type: true, category: true, amount: true,
      description: true, createdAt: true,
    },
  });

  let csv = 'Sana,Turi,Kategoriya,Summa,Izoh,Kiritilgan\n';
  for (const f of rows) {
    csv += row([
      d(f.date), f.type, f.category || '-', Number(f.amount),
      f.description || '-', dt(f.createdAt),
    ]);
  }
  return { filename: 'moliya_hisobot', csv };
}

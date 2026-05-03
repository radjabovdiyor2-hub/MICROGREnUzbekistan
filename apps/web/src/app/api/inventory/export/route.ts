import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';

// ==========================================
// Export API — Generate CSV reports
// ==========================================

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'inventory';

  let csvContent = '';
  let filename = '';

  if (type === 'inventory') {
    filename = 'ombor_hisobot';
    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: { category: { select: { nameUz: true } } },
      orderBy: { stock: 'asc' },
    });

    csvContent = 'Tovar,Kategoriya,Narx,Omborda,Qiymat\n';
    for (const p of products) {
      csvContent += `"${p.nameUz}","${p.category?.nameUz || '-'}",${p.price},${p.stock},${p.stock * p.price}\n`;
    }
  }

  else if (type === 'debts') {
    filename = 'qarzlar_hisobot';
    const debts = await prisma.debt.findMany({
      where: { isPaid: false },
      include: { supplier: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    csvContent = "Turi,Ism,Telefon,Summa,To'langan,Qoldiq,Sana,Muddat\n";
    for (const d of debts) {
      const typeLabel = d.type === 'WHO_OWES_US' ? 'Bizga qarzdor' : 'Biz qarzdormiz';
      const remaining = d.amount - d.paidAmount;
      csvContent += `"${typeLabel}","${d.personName}","${d.phone || '-'}",${d.amount},${d.paidAmount},${remaining},"${d.createdAt.toLocaleDateString('uz-UZ')}","${d.dueDate ? d.dueDate.toLocaleDateString('uz-UZ') : '-'}"\n`;
    }
  }

  else if (type === 'movements') {
    filename = 'harakatlar_hisobot';
    const movements = await prisma.stockMovement.findMany({
      include: {
        product: { select: { nameUz: true } },
        supplier: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    csvContent = 'Sana,Tovar,Turi,Miqdor,Sabab,Kim\n';
    for (const m of movements) {
      csvContent += `"${m.createdAt.toLocaleString('uz-UZ')}","${m.product.nameUz}","${m.type}",${m.quantity},"${m.reason || '-'}","${m.performedBy || '-'}"\n`;
    }
  }

  else if (type === 'sales') {
    filename = 'sotishlar_hisobot';
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 1. Online orders
    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: thirtyDaysAgo }, status: { not: 'CANCELLED' } },
      include: {
        items: { include: { product: { select: { nameUz: true } } } },
        user: { select: { firstName: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 2. POS store sales (StockMovement with reason starting with "Do'kon sotish")
    const posSales = await prisma.stockMovement.findMany({
      where: {
        type: 'OUT',
        reason: { startsWith: "Do'kon sotish" },
        createdAt: { gte: thirtyDaysAgo },
      },
      include: { product: { select: { nameUz: true, price: true } } },
      orderBy: { createdAt: 'desc' },
    });

    csvContent = 'Sana,Turi,Raqam,Tovar,Miqdor,Narx,Jami,Kim\n';

    // Online orders
    for (const o of orders) {
      for (const item of o.items) {
        csvContent += `"${o.createdAt.toLocaleString('uz-UZ')}","Online","${o.orderNumber}","${item.product.nameUz}",${item.quantity},${item.price},${item.quantity * item.price},"${o.user?.firstName || o.phone || '-'}"\n`;
      }
    }

    // POS sales
    for (const m of posSales) {
      const saleMatch = m.reason?.match(/\(S-[A-Z0-9-]+\)/);
      const saleNum = saleMatch ? saleMatch[0].replace(/[()]/g, '') : '-';
      csvContent += `"${m.createdAt.toLocaleString('uz-UZ')}","Do'kon","${saleNum}","${m.product.nameUz}",${Math.abs(m.quantity)},${m.product.price},${Math.abs(m.quantity) * m.product.price},"${m.performedBy || '-'}"\n`;
    }
  }

  else {
    return NextResponse.json({ error: 'Unknown export type' }, { status: 400 });
  }

  // Add BOM for Excel to recognize UTF-8
  const bom = '\uFEFF';
  const fullCsv = bom + csvContent;

  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(fullCsv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}_${date}.csv"`,
    },
  });
}

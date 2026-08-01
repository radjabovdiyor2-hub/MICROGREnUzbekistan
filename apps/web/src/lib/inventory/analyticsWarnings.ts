import { prisma } from '@repo/database';

// Вынесено из api/inventory/analytics/route.ts: файл перерос 200 строк,
// а в route.ts Next.js разрешает экспортировать только HTTP-обработчики.
// Каждая секция считается независимо — роут остался диспетчером.

/** Критические остатки и просроченные долги. */
export async function loadWarnings() {
  const warnings: { level: string; message: string; action: string }[] = [];

  // Critical stock
  const criticalProducts = await prisma.product.findMany({
    where: { isActive: true, stock: { lte: 3 } },
    select: { nameUz: true, stock: true },
  });
  for (const p of criticalProducts) {
    warnings.push({
      level: 'CRITICAL',
      message: `${p.nameUz} — faqat ${p.stock} dona qoldi`,
      action: 'Tezkor zakaz qiling',
    });
  }

  // Overdue debts
  const overdueDebts = await prisma.debt.findMany({
    where: { isPaid: false, dueDate: { lt: new Date() } },
    select: { personName: true, amount: true, paidAmount: true, dueDate: true },
  });
  for (const d of overdueDebts) {
    const days = Math.floor((Date.now() - new Date(d.dueDate!).getTime()) / 86400000);
    warnings.push({
      level: 'WARNING',
      message: `${d.personName} — ${(d.amount - d.paidAmount).toLocaleString()} so'm qarz, ${days} kun kechikmoqda`,
      action: "To'lovni so'rang",
    });
  }


  return { warnings };
}

import { prisma } from '@repo/database';

// Вынесено из api/inventory/analytics/route.ts: файл перерос 200 строк,
// а в route.ts Next.js разрешает экспортировать только HTTP-обработчики.
// Каждая секция считается независимо — роут остался диспетчером.

/** Разрез по категориям. */
export async function loadCategories() {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const categoryData = await prisma.category.findMany({
    select: {
      id: true, nameUz: true,
      products: {
        select: {
          id: true, stock: true, price: true,
          orderItems: {
            where: { order: { createdAt: { gte: ninetyDaysAgo }, status: { not: 'CANCELLED' } } },
            select: { quantity: true, price: true },
          },
        },
      },
    },
  });

  const categories = categoryData.map(cat => {
    const totalProducts = cat.products.length;
    const totalStock = cat.products.reduce((s, p) => s + p.stock, 0);
    const stockValue = cat.products.reduce((s, p) => s + p.stock * p.price, 0);
    const totalSold = cat.products.reduce((s, p) => s + p.orderItems.reduce((ss, i) => ss + i.quantity, 0), 0);
    const totalRevenue = cat.products.reduce((s, p) => s + p.orderItems.reduce((ss, i) => ss + i.price * i.quantity, 0), 0);

    return { id: cat.id, name: cat.nameUz, totalProducts, totalStock, stockValue, totalSold, totalRevenue };
  }).sort((a, b) => b.totalRevenue - a.totalRevenue);


  return { categories };
}

import { PrismaClient } from '@prisma/client';

// ══════════════════════════════════════════════════════════════════════
// Клиент Prisma. Расширен так, чтобы КОЛИЧЕСТВА читались числами.
//
// ЗАЧЕМ РАСШИРЕНИЕ
//
// `Product.stock`, `OrderItem.quantity`, `StockMovement.quantity` и
// `CartItem.quantity` стали `Decimal(10, 2)` — иначе нельзя продать 1.3 кг.
// Prisma отдаёт такие поля объектами `Decimal`, и это ломает две вещи:
//
//   1. Арифметику: `m.quantity * m.salePrice` перестаёт компилироваться.
//      Это как раз НЕ страшно — компилятор перечислил бы все места сам.
//
//   2. JSON — а вот это тихо. `NextResponse.json` сериализует `Decimal`
//      в СТРОКУ ("1.30"). Типы такого не ловят, и сломалось бы всё, что
//      считает на клиенте: корзина кассы, экраны админки, витринный бот,
//      офисный `catalog_repo`. Остаток «7.00» вместо 7 не падает — он
//      молча складывается в «7.007.00».
//
// Расширение снимает обе проблемы в одном месте: наружу поля выходят
// обычными `number`, внутрь пишутся как раньше (Prisma принимает число
// для Decimal-колонки).
//
// ЧЕГО ОНО НЕ ПОКРЫВАЕТ
//
// Агрегаты. `_sum.quantity` и `_avg.quantity` возвращают `Decimal` мимо
// `result`-расширения: это не результат модели. Такие места приводить к
// числу явно — TypeScript их показывает.
//
// Точность не теряется: `Decimal(10, 2)` целиком помещается в double.
// ══════════════════════════════════════════════════════════════════════

function createPrismaClient() {
  return new PrismaClient().$extends({
    result: {
      product: {
        stock: { needs: { stock: true }, compute: (p) => Number(p.stock) },
      },
      orderItem: {
        quantity: { needs: { quantity: true }, compute: (i) => Number(i.quantity) },
      },
      stockMovement: {
        quantity: { needs: { quantity: true }, compute: (m) => Number(m.quantity) },
      },
      cartItem: {
        quantity: { needs: { quantity: true }, compute: (c) => Number(c.quantity) },
      },
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

/**
 * Клиент внутри интерактивной транзакции — с теми же расширениями.
 *
 * Готовый `Prisma.TransactionClient` сюда не годится: он описывает
 * НЕрасширенный клиент, и функция с таким параметром перестаёт принимать
 * `tx` из `prisma.$transaction`. Список исключённых методов — тот же, что
 * Prisma применяет сама.
 */
export type TransactionClient = Omit<
  ExtendedPrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

const globalForPrisma = globalThis as unknown as { prisma?: ExtendedPrismaClient };

export const prisma: ExtendedPrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export * from '@prisma/client';
export default prisma;

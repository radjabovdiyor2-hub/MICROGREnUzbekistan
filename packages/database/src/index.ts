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

// ── Снимок названия товара в движении склада ──
//
// `stock_movements.product_name` нулевая и без дефолта — по той же причине,
// что и `sold_at` (см. ниже). Заполнять её должны девять мест, которые пишут
// движения, и ровно так же, как с деловой датой, кто-нибудь забудет: колонка
// нулевая, компилятор молчит.
//
// Цена забывчивости здесь выше. Товар можно удалить из каталога окончательно
// (`onDelete: SetNull`), и тогда единственным, что осталось от строки книги
// продаж, будет это название. Без него в отчёте появится безымянная сумма.
//
// Явное значение всегда побеждает: касса и отмена заказа передают название
// сами — у них карточка товара уже в руках, и лишний запрос не нужен.
//
// Чтение идёт мимо интерактивной транзакции (через базовый клиент): это
// SELECT по чужой строке, блокировок он не берёт. Товар, созданный в той же
// незакоммиченной транзакции, отсюда не виден — тогда снимок останется
// пустым, а название по-прежнему придёт из живой связи.
async function fillProductName(
  client: PrismaClient,
  data: { productId?: string | null; productName?: string | null },
): Promise<void> {
  if (data.productName != null || !data.productId) return;
  const card = await client.product.findUnique({
    where: { id: data.productId },
    select: { nameUz: true },
  });
  if (card) data.productName = card.nameUz;
}

function createPrismaClient() {
  const base = new PrismaClient();
  return base.$extends({
    // ── Деловая дата движения проставляется, даже если её забыли ──
    //
    // У `stock_movements.sold_at` НЕТ дефолта в базе, и это осознанно: прод
    // накатывает схему автоматическим `db push --accept-data-loss`, а колонка
    // с `@default(now())` проставила бы момент деплоя всей истории продаж.
    //
    // Плата за это — компилятор больше не требует поле: колонка нулевая, и
    // пропуск проходит молча. Ровно так три места (онлайн-заказ, возврат и
    // сбор урожая) и записали движения без деловой даты, пройдя typecheck.
    //
    // Дефолт живёт здесь: в приложении, а не в DDL. Явное значение всегда
    // побеждает — касса ставит дату продажи, заказ время оформления.
    query: {
      stockMovement: {
        async create({ args, query }) {
          if (args.data && !Array.isArray(args.data)) {
            if (args.data.soldAt == null) args.data.soldAt = new Date();
            await fillProductName(base, args.data);
          }
          return query(args);
        },
        async createMany({ args, query }) {
          const rows = Array.isArray(args.data) ? args.data : [args.data];
          for (const row of rows) {
            if (row.soldAt == null) row.soldAt = new Date();
            await fillProductName(base, row);
          }
          return query(args);
        },
      },
    },
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

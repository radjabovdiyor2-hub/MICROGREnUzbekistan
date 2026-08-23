import { prisma } from '@repo/database';
import { deliveryFeeForSubtotal, getNumber } from '@/lib/settings/store';
import { linkTelegram } from '@/lib/customers/mergeUsers';
import { validatePromo, consumePromo } from '@/lib/promo';
import { generateOrderNumber } from './notify';
import { normalizePhone } from '@/lib/phone';
import { cartTotal } from '@/lib/qty';
import type { orderSchema, OrderItemInput } from './schema';
import type { z } from 'zod';

// ══════════════════════════════════════════════════════════════════════
// Создание заказа. Вынесено из api/orders/route.ts дословно: здесь живёт
// конкурентность оформления — условное списание бонусов и upsert клиента
// по телефону, — и переписывать её рефакторингом нельзя.
//
// Отказ возвращается значением, а не исключением: роут превращает его в
// HTTP-ответ, а все причины отказа видны в одном месте.
// ══════════════════════════════════════════════════════════════════════

type OrderBody = z.infer<typeof orderSchema>;

type CreatedOrder = Awaited<ReturnType<typeof prisma.order.create>> & {
  /**
   * `productId` и `product` нулевые: товар мог быть удалён из каталога после
   * заказа (`onDelete: SetNull`). У ТОЛЬКО ЧТО созданного заказа они всегда
   * заполнены — тип честен ради тех, кто читает заказ позже.
   */
  items: {
    productId: string | null;
    productName: string | null;
    quantity: number;
    price: number;
    product: { nameUz: string } | null;
  }[];
};

export type CreateOrderResult =
  | { ok: true; order: CreatedOrder; user: Awaited<ReturnType<typeof prisma.user.upsert>>; customerName: string }
  | { ok: false; error: string; status: number };

/**
 * Кто оформляет заказ. Определяется в роуте по подписи, а не по телу запроса.
 *
 * `userId` в теле принимался как есть: если он резолвился, на этот аккаунт
 * вешался заказ и с него СПИСЫВАЛИСЬ бонусы. Чужой id — и покупка оплачена
 * чужими баллами. То же было доступно через «ботовский» формат тела с чужим
 * telegramId: достаточно было прислать `name` вместо `customer`.
 */
export interface OrderIdentity {
  /** id вошедшего покупателя из подписанной сессии — иначе null. */
  customerId: string | null;
  /** Вызов витринного бота: ему telegramId/userId в теле верить можно. */
  trusted: boolean;
}

const ANONYMOUS: OrderIdentity = { customerId: null, trusted: false };

/**
 * Источники, которым разрешена договорная цена.
 *
 * Офис продаёт ресторанам по согласованной цене — это суть его работы.
 * Витринный бот (`telegram_bot`) торгует в розницу по прайсу, и его цена
 * берётся из каталога, даже когда запрос подписан общим секретом.
 */
const NEGOTIATING_SOURCES = new Set(['ai_office']);

export async function createOrder(
  body: OrderBody,
  identity: OrderIdentity = ANONYMOUS,
): Promise<CreateOrderResult> {
  // ── Bot compatibility layer ─────────────────────────────
  // The Telegram bot sends a flat format:
  //   { name, phone, address, items: [{ id, title, price, quantity }], source, telegramId }
  // The web storefront sends:
  //   { customer: { firstName, phone, address }, items: [{ productId, price, quantity }], city }
  // Detect bot format (has `name` string at top level instead of `customer` object)
  // and normalise before the rest of the handler runs.
  let { customer, items, paymentMethod, userId } = body;
  const { bonusToUse, city } = body;

  if (typeof body.name === 'string' && !customer) {
    // Bot format → normalise to web format
    customer = {
      firstName: body.name,
      phone: body.phone || '',
      address: body.address || 'Telegram bot orqali',
      // Заметку офис кладёт на ВЕРХНИЙ уровень тела
      // (`shared/storefront_orders.py`), а схема знает `note` только внутри
      // `customer` — нестрогий Zod-объект молча срезал лишнее поле. «Позвонить
      // перед доставкой» и «договорная цена» до `orders.note` не доезжали, и
      // курьер условий не видел.
      note: body.note ?? null,
    };
    // Map bot item shape: { id → productId }
    items = (body.items || []).map((item: OrderItemInput) => ({
      productId: item.productId || item.id || '',
      price: item.price,
      quantity: item.quantity,
    }));
    paymentMethod = body.paymentMethod || 'cash';

    // If bot sent a telegramId, resolve the user from it
    if (body.telegramId && !userId && identity.trusted) {
      const tgUser = await prisma.user.findUnique({
        where: { telegramId: BigInt(body.telegramId) },
      });
      if (tgUser) userId = tgUser.id;
    }
  }

  // Владелец заказа — из подписи, а не из тела. Вошедшему покупателю
  // подставляем его собственный id (что бы ни лежало в `userId`), гостю не
  // оставляем никакого: его заказ привяжется по телефону ниже. Боту верим —
  // он пришёл с общим секретом и оформляет заказ от имени своего клиента.
  if (identity.customerId) {
    userId = identity.customerId;
  } else if (!identity.trusted) {
    userId = undefined;
  }

  // Validate
  if (!customer?.firstName || !customer?.phone || !customer?.address) {
    return { ok: false, error: "Shaxsiy ma'lumotlar to'liq emas", status: 400 };
  }
  if (!items || items.length === 0) {
    return { ok: false, error: "Savat bo'sh", status: 400 };
  }

  // Цену ставит сервер, а не покупатель.
  //
  // Раньше `subtotal` складывался из присланного `item.price`, и та же цена
  // ложилась в `order_items`. Тело `{"price":1,"quantity":100}` списывало сто
  // лотков со склада и уходило в P&L по одному суму; завышенная цена тем же
  // способом накручивала реферальный кэшбэк — он считается процентом от
  // `order.total`. Доставка и промокод в этом же файле всегда считались на
  // сервере, товар оставался единственной дырой.
  // Имя снимается вместе с ценой и по той же причине: карточку товара
  // переименовывают и удаляют, а прошлый заказ обязан остаться читаемым.
  // См. `OrderItem.productName` в схеме.
  const pricedItems: { productId: string; productName: string; quantity: number; price: number }[] = [];
  const requestedIds = items.map((item: OrderItemInput) => item.productId || item.id || '');
  const catalog = await prisma.product.findMany({
    where: { id: { in: requestedIds }, isActive: true },
    select: { id: true, price: true, nameUz: true },
  });
  const cardById = new Map(catalog.map((product) => [product.id, product]));

  for (const item of items) {
    const productId = item.productId || item.id || '';
    const card = cardById.get(productId);
    if (card === undefined) {
      return { ok: false, error: "Mahsulot topilmadi yoki sotuvda yo'q", status: 409 };
    }
    const catalogPrice = card.price;

    // Договорная цена — право ОФИСА, а не любого владельца секрета.
    //
    // Офис регистрирует продажи ресторанам по согласованной цене, и подменять
    // её прайсовой нельзя: `storefront_orders.create_order` передаёт цену
    // намеренно (см. его докстринг). Доверять цене из БРАУЗЕРА нельзя тем
    // более — именно так покупатель назначал себе сумму заказа.
    //
    // Но `BOT_SECRET` один на офис и на витринный бот, а корзина бота живёт
    // в Redis семь суток (`cart_storage.REDIS_TTL`). Пока «доверенный» значило
    // «любой предъявитель секрета», недельная цена из корзины становилась
    // договорной и заказ уходил дешевле прайса. Поэтому решает не подпись, а
    // ИСТОЧНИК: список ниже — те, кто торгуется по существу дела. Незнакомый
    // источник получает каталожную цену, то есть новый интегратор безопасен
    // по умолчанию.
    const negotiable = identity.trusted && NEGOTIATING_SOURCES.has(body.source || '');
    const negotiated =
      negotiable && typeof item.price === 'number' && item.price >= 0
        ? item.price
        : catalogPrice;

    // Розничный канал прислал свою цену и она разошлась с прайсом — значит
    // клиент видел на экране не то, что попадёт в заказ. Это чинится на
    // стороне канала, но знать об этом надо здесь и сразу.
    if (!negotiable && typeof item.price === 'number' && item.price !== catalogPrice) {
      console.warn(
        `[orders] цена из канала «${body.source || 'web'}» разошлась с прайсом: ` +
          `${card.nameUz} — прислано ${item.price}, в каталоге ${catalogPrice}`,
      );
    }

    pricedItems.push({ productId, productName: card.nameUz, quantity: item.quantity, price: negotiated });
  }

  // Позиции округляются по одной и только потом складываются: иначе
  // сохранённый `total` разойдётся с суммой, которую пересчитывают отчёты
  // (lib/revenue/salesLedger) и зеркало CRM.
  const subtotal = cartTotal(pricedItems);
  const deliveryFee = await deliveryFeeForSubtotal(subtotal);

  // Resolve the ordering user: prefer the logged-in account (userId), then
  // phone, else create a guest by phone.
  // Телефон — в едином виде (lib/phone). Регистрация в кабинете хранила его
  // как «901234567», а сюда приходило «+998901234567»: `upsert` не находил
  // запись и заводил ВТОРОГО пользователя на того же человека.
  const normalizedPhone = normalizePhone(customer.phone) || customer.phone;

  let user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
  if (!user) {
    // Atomic upsert by phone — two concurrent first-time orders sharing a phone
    // would otherwise both miss findUnique and both create → unique-violation 500.
    user = await prisma.user.upsert({
      where: { phone: normalizedPhone },
      update: {},
      create: {
        phone: normalizedPhone,
        firstName: customer.firstName,
        lastName: customer.lastName || null,
      },
    });
  }

  // Заказ из бота ПРИВЯЗЫВАЕТ Telegram к аккаунту.
  //
  // Раньше поиск по `telegramId` был односторонним: если такого пользователя
  // ещё нет, заказ создавался по телефону — и `telegramId` не записывался
  // никогда. Следствие било по клиенту бота каждый день: «Мои заказы»,
  // «Профиль» и «Повторить заказ» отвечали «у вас пока нет заказов» через
  // минуту после покупки, потому что бот ищет себя именно по `telegramId`.
  // Отзывы по той же причине не сохранялись вовсе.
  //
  // Если этот Telegram уже занят другим аккаунтом — это тот самый дубль
  // «телефон отдельно, Telegram отдельно»: `linkTelegram` сливает их и
  // возвращает выжившего.
  if (identity.trusted && body.telegramId) {
    try {
      const keptId = await linkTelegram(user.id, BigInt(body.telegramId));
      if (keptId !== user.id) {
        const kept = await prisma.user.findUnique({ where: { id: keptId } });
        if (kept) user = kept;
      }
    } catch (error) {
      // Привязка не должна ронять заказ: заказ важнее, чем связка личностей.
      console.error('[orders] не удалось привязать Telegram к аккаунту:', error);
    }
  }

  // Bonus redemption — only for the authenticated account, capped by the
  // balance and by the goods subtotal (delivery is never covered by points).
  // Порог списания брался из настроек: клиенту его показывали в
  // /api/referral ("minCashout: 50000"), но при оформлении не проверяли —
  // списать можно было с любого баланса. Теперь обещание и поведение
  // совпадают; чтобы вернуть прежнюю вольницу, поставьте порог в 0.
  const minCashout = await getNumber('bonus.minCashout');
  const authed = !!userId && user.id === userId;
  let bonusApplied = authed && user.bonusPoints >= minCashout
    ? Math.max(0, Math.min(Math.floor(Number(bonusToUse) || 0), user.bonusPoints, subtotal))
    : 0;

  // Promo code — authoritative re-validation on submit (client preview via
  // /api/promo is advisory only). Capped by the goods subtotal minus bonus.
  let promoApplied = 0;
  const promoCode = body.promoCode ? String(body.promoCode).trim().toUpperCase() : null;
  if (promoCode) {
    const promoResult = await validatePromo(promoCode, subtotal);
    if (!promoResult.valid) {
      return { ok: false, error: promoResult.error ?? "Promokod rad etildi", status: 422 };
    }
    // Использование занимаем СРАЗУ, одним условным UPDATE, а не после
    // создания заказа: между проверкой и инкрементом помещался чужой заказ,
    // и последнее использование доставалось обоим.
    const claimed = await consumePromo(promoCode, promoResult.maxUses);
    if (!claimed) {
      return {
        ok: false,
        error: 'Promokod limiti tugagan / Лимит использований исчерпан',
        status: 422,
      };
    }
    promoApplied = Math.min(promoResult.discount, subtotal - bonusApplied);
  }

  // Reserve bonus points + create the order ATOMICALLY (single transaction):
  //  • the reservation is a CONDITIONAL decrement, so two concurrent orders from
  //    the same account can't double-spend the same balance (TOCTOU-safe);
  //  • a failure mid-flight never debits points without creating the order.
  const order = await prisma.$transaction(async (tx) => {
    if (bonusApplied > 0) {
      const reserved = await tx.user.updateMany({
        where: { id: user!.id, bonusPoints: { gte: bonusApplied } },
        data: { bonusPoints: { decrement: bonusApplied } },
      });
      // Balance changed under us (another concurrent order spent it) → don't apply.
      if (reserved.count === 0) bonusApplied = 0;
    }
    return tx.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        userId: user!.id,
        status: 'PENDING',
        subtotal,
        deliveryFee,
        total: subtotal + deliveryFee - bonusApplied - promoApplied,
        discount: bonusApplied + promoApplied,
        // Раскладка скидки. Без неё отменённый заказ не мог вернуть ни баллы,
        // ни использование промокода: из общей суммы одно от другого не
        // отделить, и клиент терял баллы навсегда.
        bonusUsed: bonusApplied,
        promoCode: promoApplied > 0 ? promoCode : null,
        city: city || 'tashkent',
        address: customer!.address,
        phone: normalizedPhone,
        note: customer!.note || null,
        // Канал продажи: его передавали все три клиента, а записывать было
        // некуда — колонки не существовало.
        source: body.source || 'web',
        // Автор — только от доверенного вызывающего (общий секрет офиса/бота).
        // Из браузера это поле игнорируется: иначе покупатель мог бы приписать
        // свой заказ любому сотруднику, а по этому полю считается выработка.
        performedBy: identity.trusted && body.performedBy ? String(body.performedBy).slice(0, 100) : null,
        paymentMethod: paymentMethod || 'cash',
        paymentStatus: 'PENDING',
        items: { create: pricedItems },
      },
      include: {
        items: { include: { product: { select: { nameUz: true } } } },
      },
    });
  });

  // Использование промокода уже занято выше, до создания заказа.

  return { ok: true, order, user, customerName: customer.firstName };
}

import { prisma } from '@repo/database';

import { createOrder } from '@/lib/orders/create';
import { runAfterCreate } from '@/lib/orders/afterCreate';
import { publish } from '@/lib/realtime/bus';

import { channelDef } from './registry';
import { getChannelPolicy } from './policy';
import { channelPrice } from './availability';
import type { ChannelOrderInput } from './orderSchema';

// ══════════════════════════════════════════════════════════════════════
// Приём заказа с площадки.
//
// Заказ создаёт ТА ЖЕ дверь, что и заказ с сайта (`createOrder`): второй
// двери не существует, иначе остаток не спишется, номер не выдастся и
// зеркало в CRM не уйдёт — ровно та ошибка, из-за которой продажа офиса
// когда-то не регистрировалась.
//
// Идемпотентность обязательна. Площадки повторяют вебхук при любом
// таймауте, а повтор без ключа — это второй заказ, второе списание
// остатка и звонок покупателю «вы заказали дважды».
// ══════════════════════════════════════════════════════════════════════

export type IngestResult =
  | { ok: true; orderId: string; orderNumber: string; duplicate: boolean }
  | { ok: false; error: string; status: number };

/** Строка канала. Нет её — канал не заведён владельцем, заказ принять некуда. */
export interface Shortfall {
  name: string;
  requested: number;
  available: number;
}

/**
 * Позиции, которых заказано больше, чем есть на складе.
 *
 * На витрине заказ сверх остатка — норма: микрозелень растят под заказ,
 * покупатель ждёт следующего среза и знает об этом. У площадки всё иначе:
 * там уже продали и часто уже взяли деньги, а отмена стоит процентов от
 * суммы и рейтинга магазина. Поэтому заказ мы всё равно принимаем (иначе
 * площадка сочтёт связь сломанной и будет слать вебхук по кругу), но
 * владелец обязан узнать об этом сразу, а не из отчёта в конце недели.
 */
export function shortfalls(
  items: { name: string; quantity: number; stock: number }[],
): Shortfall[] {
  return items
    .filter((i) => i.quantity > i.stock)
    .map((i) => ({ name: i.name, requested: i.quantity, available: Math.max(0, i.stock) }));
}

/** Строка сигнала владельцу: что именно продали сверх запаса. */
export function describeShortfalls(short: Shortfall[]): string {
  return short
    .map((s) => `${s.name}: заказано ${s.requested}, на складе ${s.available}`)
    .join('; ');
}

async function channelRow(code: string) {
  return prisma.salesChannel.findUnique({ where: { code }, select: { id: true } });
}

/**
 * Найти товары заказа по id или артикулу.
 *
 * Ненайденный товар — отказ, а не пропуск позиции: заказ, собранный из
 * половины позиций, приедет покупателю неполным, и узнает он об этом от
 * курьера.
 */
async function resolveItems(input: ChannelOrderInput) {
  const ids = input.items.map((i) => i.productId).filter((v): v is string => Boolean(v));
  const skus = input.items.map((i) => i.sku).filter((v): v is string => Boolean(v));

  const found = await prisma.product.findMany({
    where: { isActive: true, OR: [{ id: { in: ids } }, { sku: { in: skus } }] },
    select: { id: true, sku: true, price: true, stock: true, nameRu: true },
  });

  const byId = new Map(found.map((p) => [p.id, p]));
  const bySku = new Map(found.filter((p) => p.sku).map((p) => [p.sku as string, p]));

  const resolved: {
    productId: string;
    quantity: number;
    catalogPrice: number;
    sentPrice?: number;
    /** Остаток и имя нужны для проверки на продажу сверх запаса — см. `shortfalls`. */
    stock: number;
    name: string;
  }[] = [];
  for (const item of input.items) {
    const card = (item.productId && byId.get(item.productId)) || (item.sku && bySku.get(item.sku)) || null;
    if (!card) {
      return { ok: false as const, missing: item.productId || item.sku || '(без идентификатора)' };
    }
    resolved.push({
      productId: card.id,
      quantity: item.quantity,
      catalogPrice: card.price,
      sentPrice: item.price,
      stock: Number(card.stock),
      name: card.nameRu,
    });
  }
  return { ok: true as const, items: resolved };
}

export async function ingestChannelOrder(
  code: string,
  input: ChannelOrderInput,
): Promise<IngestResult> {
  const def = channelDef(code);
  if (!def || !def.acceptsOrders) {
    return { ok: false, error: 'Канал не принимает заказы', status: 404 };
  }

  const row = await channelRow(code);
  if (!row) {
    return { ok: false, error: 'Канал не заведён в настройках', status: 409 };
  }

  // ── Повтор вебхука ────────────────────────────────────────────────
  // Выключенный канал заказ всё равно принимает: покупатель уже заплатил
  // площадке, и отказ здесь означал бы деньги без заказа. Выключение —
  // это «не показывать товар», а не «терять то, что уже продано».
  const seen = await prisma.channelOrder.findUnique({
    where: { channelId_externalId: { channelId: row.id, externalId: input.externalId } },
    select: { orderId: true, order: { select: { orderNumber: true } } },
  });
  if (seen?.orderId && seen.order) {
    return { ok: true, orderId: seen.orderId, orderNumber: seen.order.orderNumber, duplicate: true };
  }

  const resolved = await resolveItems(input);
  if (!resolved.ok) {
    return { ok: false, error: `Товар не найден в каталоге: ${resolved.missing}`, status: 422 };
  }

  const policy = await getChannelPolicy(code);

  // Расхождение цены. Заказ им не блокируется — покупатель уже заплатил
  // площадке столько, сколько там написано, — но владелец обязан увидеть,
  // что витрина и площадка разошлись в прайсе.
  let priceDelta = 0;
  for (const item of resolved.items) {
    if (typeof item.sentPrice !== 'number') continue;
    const expected = channelPrice(item.catalogPrice, policy.markupPercent);
    priceDelta += (item.sentPrice - expected) * item.quantity;
  }

  // Цену в заказ НЕ передаём: её ставит каталог внутри `createOrder`.
  // Передать цену площадки значило бы записать в выручку сумму с чужой
  // наценкой — и разойтись с отчётами, которые считают по прайсу.
  const created = await createOrder(
    {
      customer: {
        firstName: input.customer.name,
        phone: input.customer.phone,
        address: input.customer.address,
        note: input.customer.note ?? null,
      },
      items: resolved.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      paymentMethod: input.paymentMethod ?? 'marketplace',
      city: input.city ?? policy.cities[0] ?? 'samarkand',
      source: code,
    },
    // Канал — доверенный вызывающий: он пришёл с общим секретом. Права
    // договорной цены это ему не даёт (`NEGOTIATING_SOURCES` в create.ts),
    // и это правильно: розничная площадка торгует по прайсу.
    { customerId: null, trusted: true },
  );

  if (!created.ok) {
    // Заявку сохраняем даже при отказе: без неё пришедший и потерянный
    // заказ не оставил бы следа вовсе, а площадка считает его принятым.
    await prisma.channelOrder.upsert({
      where: { channelId_externalId: { channelId: row.id, externalId: input.externalId } },
      update: { payload: JSON.parse(JSON.stringify(input)) },
      create: {
        channelId: row.id,
        externalId: input.externalId,
        payload: JSON.parse(JSON.stringify(input)),
        priceDelta,
      },
    });
    return { ok: false, error: created.error, status: created.status };
  }

  await prisma.channelOrder.upsert({
    where: { channelId_externalId: { channelId: row.id, externalId: input.externalId } },
    update: { orderId: created.order.id, priceDelta },
    create: {
      channelId: row.id,
      externalId: input.externalId,
      orderId: created.order.id,
      priceDelta,
      payload: JSON.parse(JSON.stringify(input)),
    },
  });

  // Площадка уже собрала деньги — отмечаем это отдельным шагом, а не
  // внутри `createOrder`: там живёт конкурентность оформления, и лезть в
  // неё ради одного поля нельзя.
  if (input.paid) {
    await prisma.order.update({
      where: { id: created.order.id },
      data: { paymentStatus: 'PAID' },
    });
  }

  // ⚠️ Без этого вызова заказ с площадки НЕ списывает остаток.
  //
  // `createOrder` создаёт только сам заказ. Списание, движение по складу,
  // уведомления и зеркало в CRM живут в `runAfterCreate` — так же, как у
  // заказа с сайта (`api/orders/route.ts`). Пропустить его значило бы
  // продать один лоток дважды: на площадке и на витрине.
  await runAfterCreate(created.order, created.user, created.customerName);

  // Продажа сверх запаса. Считаем ДО списания? Нет — после: остаток на
  // момент разбора уже учитывает этот заказ, а нам нужен тот, что был.
  // Поэтому берём числа из `resolved`, снятые при поиске товаров.
  const short = shortfalls(resolved.items);
  if (short.length > 0) {
    await noteOversell(code, created.order.orderNumber, short);
  }

  // Открытые экраны админки узнают о заказе сами.
  publish('orders', 'inventory', 'products');

  return {
    ok: true,
    orderId: created.order.id,
    orderNumber: created.order.orderNumber,
    duplicate: false,
  };
}


/**
 * Сигнал владельцу: площадка продала то, чего нет.
 *
 * Отдельной функцией и под своим `catch` — заказ уже создан и списан, и
 * упасть на записи предупреждения значило бы отдать площадке 500 на
 * успешно принятый заказ. Она бы прислала его снова.
 */
async function noteOversell(code: string, orderNumber: string, short: Shortfall[]): Promise<void> {
  const def = channelDef(code);
  try {
    await prisma.ownerAlert.create({
      data: {
        kind: 'channel_oversell',
        severity: 'warning',
        title: `${def?.name ?? code}: продано больше, чем есть`,
        message:
          `Заказ ${orderNumber} с площадки «${def?.name ?? code}». ` +
          `${describeShortfalls(short)}. ` +
          'Отмена на площадке стоит процентов от суммы и рейтинга — ' +
          'решите сегодня: срезать, докупить или предупредить покупателя.',
        source: 'storefront',
      },
    });
  } catch (err) {
    console.error('[channels] сигнал о продаже сверх запаса не записан:', err);
  }
}

import { prisma, Prisma } from '@repo/database';

import { VISIT_TYPES } from './visits';

// ══════════════════════════════════════════════════════════════════════
// План объезда на сервере: сохранить, прочитать, посчитать исполнение.
//
// ЗАЧЕМ НА СЕРВЕРЕ. Первая версия плана жила в localStorage телефона:
// продавец собирал его себе сам, владелец не видел и назначить не мог.
// Такой план — помощь памяти, но не инструмент: составляет и отчитывается
// один человек.
//
// ИСПОЛНЕНИЕ ЗДЕСЬ НЕ ХРАНИТСЯ, И ЭТО ГЛАВНОЕ РЕШЕНИЕ ФАЙЛА.
//
// Отметки визитов уже лежат в `interactions`. Колонка «выполнено» в плане
// была бы вторым источником правды и разошлась бы с ними на первом же
// визите, сделанном мимо плана: человек заехал, отметился, а план считает
// остановку невыполненной. Поэтому выполненность ВЫЧИСЛЯЕТСЯ на чтении —
// «была ли отметка к этому клиенту в этот день».
//
// Следствие, ради которого всё и затевалось: план нельзя «закрыть»
// нажатием. Закрывает его только настоящая отметка визита — та самая, что
// несёт координату и расстояние до клиента.
// ══════════════════════════════════════════════════════════════════════

export interface PlanStopView {
  customerId: number;
  name: string;
  latitude: number | null;
  longitude: number | null;
  orderIndex: number;
  /** Была ли отметка визита к этому клиенту в день плана. */
  done: boolean;
  /** Расстояние отметки до клиента, метры. null — места нет. */
  distanceM: number | null;
  accuracyM: number | null;
}

/** Что взять с собой: товар и сколько. Пустой список — объезд без развоза. */
export interface PlanItemView {
  productId: string;
  name: string;
  qty: number;
  unit: string | null;
}

export interface PlanView {
  id: number;
  planDate: string;
  /** Кому объезжать. Пустая строка — план ничей. */
  assignee: string;
  author: string;
  source: string;
  /** Список товаров к загрузке. Пустой — это норма, а не пробел. */
  items: PlanItemView[];
  stops: PlanStopView[];
  doneCount: number;
}

/** Полночь и следующая полночь для выборки «за этот день». */
function dayBounds(date: Date): { from: Date; to: Date } {
  const from = new Date(date);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from, to };
}

/**
 * Сохранить план на дату для сотрудника.
 *
 * ЗАМЕНЯЕТ, а не дополняет: план на сегодня — это ответ на вопрос «куда
 * ехать», и вторая его версия рядом с первой означала бы, что «выполнено 6
 * из 8» считается неизвестно по какому. Уникальность (дата, сотрудник)
 * держит это на уровне схемы, а не на аккуратности вызывающего.
 */
export async function saveDayPlan(params: {
  planDate: Date;
  /** Кому объезжать. Пустая строка — черновик владельца. */
  assignee: string;
  author: string;
  source: 'self' | 'owner';
  customerIds: number[];
  /** Что взять с собой. `undefined` — список не трогаем, `[]` — очистить. */
  items?: { productId: string; qty: number }[];
}): Promise<{ id: number; stops: number; items: number }> {
  const { from } = dayBounds(params.planDate);

  return prisma.$transaction(async (tx) => {
    const plan = await tx.visitPlan.upsert({
      where: { planDate_assignee: { planDate: from, assignee: params.assignee } },
      create: {
        planDate: from,
        assignee: params.assignee,
        author: params.author,
        source: params.source,
      },
      update: { author: params.author, source: params.source },
      select: { id: true },
    });

    // Остановки переписываем целиком: план собран заново, и порядок в нём
    // новый. Слияние старых с новыми дало бы список, которого никто не
    // составлял.
    await tx.visitPlanStop.deleteMany({ where: { planId: plan.id } });

    // Дубли отсекаем здесь, а не полагаемся на уникальный индекс: он бы
    // уронил всю запись целиком из-за одной повторённой точки.
    const unique = [...new Set(params.customerIds)];
    if (unique.length > 0) {
      await tx.visitPlanStop.createMany({
        data: unique.map((customerId, i) => ({
          planId: plan.id,
          customerId,
          orderIndex: i,
        })),
      });
    }

    // Список товаров переписывается целиком по той же причине, что и
    // остановки. `undefined` от `[]` отличаем намеренно: «список не
    // присылали» и «список очистили» — разные намерения, и молча стирать
    // загрузку машины при сохранении маршрута нельзя.
    let itemCount = 0;
    if (params.items !== undefined) {
      await tx.visitPlanItem.deleteMany({ where: { planId: plan.id } });
      // Один товар — одна строка: повтор в присланном списке означает, что
      // человек добавил его дважды, а не что нужно две записи.
      const byProduct = new Map<string, number>();
      for (const item of params.items) {
        if (!item.productId || item.qty <= 0) continue;
        byProduct.set(item.productId, (byProduct.get(item.productId) ?? 0) + item.qty);
      }
      if (byProduct.size > 0) {
        await tx.visitPlanItem.createMany({
          data: [...byProduct].map(([productId, qty]) => ({ planId: plan.id, productId, qty })),
        });
      }
      itemCount = byProduct.size;
    } else {
      itemCount = await tx.visitPlanItem.count({ where: { planId: plan.id } });
    }

    return { id: plan.id, stops: unique.length, items: itemCount };
  });
}

/**
 * Планы на дату. Без `assignee` — все, то есть взгляд владельца.
 *
 * Выполненность считается ОДНИМ запросом на все планы сразу: по остановке
 * на запрос дало бы полсотни походов в базу на утреннем экране.
 */
export async function readDayPlans(params: {
  planDate: Date;
  /** Чей план. Не задан — все планы на дату, то есть взгляд владельца. */
  assignee?: string;
}): Promise<PlanView[]> {
  const { from, to } = dayBounds(params.planDate);

  // Условие собираем ОТДЕЛЬНО: условный спред прямо в аргументах
  // расширяет их тип, и Prisma теряет вывод по `include` — `stops`
  // исчезает из результата, хотя запрос его вернёт.
  const where: Prisma.VisitPlanWhereInput = {
    planDate: from,
    ...(params.assignee !== undefined ? { assignee: params.assignee } : {}),
  };

  const plans = await prisma.visitPlan.findMany({
    where,
    include: {
      stops: {
        orderBy: { orderIndex: 'asc' },
        include: {
          customer: {
            select: { id: true, name: true, companyName: true, latitude: true, longitude: true },
          },
        },
      },
      items: {
        include: { product: { select: { nameRu: true, unit: true } } },
      },
    },
    orderBy: { assignee: 'asc' },
  });

  const customerIds = plans.flatMap((p) => p.stops.map((s) => s.customerId));
  const visits =
    customerIds.length === 0
      ? []
      : await prisma.interaction.findMany({
          where: {
            customerId: { in: customerIds },
            interactionType: { in: VISIT_TYPES },
            createdAt: { gte: from, lt: to },
          },
          select: { customerId: true, distanceM: true, accuracyM: true },
          orderBy: { createdAt: 'desc' },
        });

  // Первая по времени отметка на клиента — она и закрывает остановку.
  const byCustomer = new Map<number, { distanceM: number | null; accuracyM: number | null }>();
  for (const v of visits) {
    if (v.customerId === null || byCustomer.has(v.customerId)) continue;
    byCustomer.set(v.customerId, { distanceM: v.distanceM, accuracyM: v.accuracyM });
  }

  return plans.map((p) => {
    const stops: PlanStopView[] = p.stops.map((s) => {
      const visit = byCustomer.get(s.customerId);
      return {
        customerId: s.customerId,
        name: s.customer.companyName || s.customer.name || `#${s.customerId}`,
        latitude: s.customer.latitude,
        longitude: s.customer.longitude,
        orderIndex: s.orderIndex,
        done: visit !== undefined,
        distanceM: visit?.distanceM ?? null,
        accuracyM: visit?.accuracyM ?? null,
      };
    });

    return {
      id: p.id,
      planDate: p.planDate.toISOString().slice(0, 10),
      assignee: p.assignee,
      author: p.author,
      source: p.source,
      stops,
      items: p.items.map((item) => ({
        productId: item.productId,
        name: item.product.nameRu,
        qty: item.qty,
        unit: item.product.unit,
      })),
      doneCount: stops.filter((s) => s.done).length,
    };
  });
}


// ══════════════════════════════════════════════════════════════════════
// День целиком: не только план, но и то, что произошло на самом деле.
//
// План отвечал на вопрос «куда собирались» и «сколько из этого объехали».
// Двух вещей в нём не было, и обе — это и есть работа:
//
//   • визит, сделанный БЕЗ плана. Продавец заехал по дороге, отметился —
//     и в отчёте дня этого не видно вовсе, потому что смотрели только на
//     остановки плана. Отсутствие такой поездки в отчёте читается как
//     безделье, а её наличие — как перевыполнение;
//
//   • чек с выезда. Смысл поездки — продажа, а она лежала в кассе отдельно
//     и с днём объезда не сходилась ничем, кроме даты.
//
// Считаем одним походом в базу на каждый источник, а не по записи.
// ══════════════════════════════════════════════════════════════════════

export interface DayVisit {
  customerId: number | null;
  name: string;
  /** Кто отметил. Пусто — отметка старая, автора тогда не записывали. */
  actor: string;
  type: string;
  at: string;
  distanceM: number | null;
  accuracyM: number | null;
  /** Была ли эта точка в чьём-то плане на этот день. */
  planned: boolean;
}

export interface DaySale {
  number: string;
  actor: string;
  customerName: string | null;
  total: number;
  at: string;
}

export interface DayFacts {
  visits: DayVisit[];
  sales: DaySale[];
}

export async function readDayFacts(params: {
  planDate: Date;
  /** Чьи дела. Не задан — все, то есть взгляд владельца. */
  assignee?: string;
}): Promise<DayFacts> {
  const { from, to } = dayBounds(params.planDate);

  const [rawVisits, rawSales, plannedStops] = await Promise.all([
    prisma.interaction.findMany({
      where: {
        interactionType: { in: VISIT_TYPES },
        createdAt: { gte: from, lt: to },
        ...(params.assignee ? { botName: params.assignee } : {}),
      },
      select: {
        customerId: true,
        botName: true,
        interactionType: true,
        createdAt: true,
        distanceM: true,
        accuracyM: true,
        customer: { select: { name: true, companyName: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    // Только выездные чеки: продажа за прилавком к объезду отношения не
    // имеет, и мешать их значило бы приписывать разъезду выручку точки.
    prisma.posSale.findMany({
      where: {
        kind: 'sale',
        origin: 'field',
        soldAt: { gte: from, lt: to },
        ...(params.assignee ? { performedBy: params.assignee } : {}),
      },
      select: {
        number: true,
        performedBy: true,
        total: true,
        soldAt: true,
        customer: { select: { name: true, companyName: true } },
      },
      orderBy: { soldAt: 'asc' },
    }),
    prisma.visitPlanStop.findMany({
      where: { plan: { planDate: from, ...(params.assignee ? { assignee: params.assignee } : {}) } },
      select: { customerId: true },
    }),
  ]);

  const planned = new Set(plannedStops.map((s) => s.customerId));

  return {
    visits: rawVisits.map((v) => ({
      customerId: v.customerId,
      name: v.customer?.companyName || v.customer?.name || `#${v.customerId ?? '—'}`,
      actor: v.botName ?? '',
      type: v.interactionType,
      at: v.createdAt.toISOString(),
      distanceM: v.distanceM,
      accuracyM: v.accuracyM,
      planned: v.customerId !== null && planned.has(v.customerId),
    })),
    sales: rawSales.map((s) => ({
      number: s.number,
      actor: s.performedBy,
      customerName: s.customer?.companyName || s.customer?.name || null,
      total: s.total,
      at: s.soldAt.toISOString(),
    })),
  };
}

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

export interface PlanView {
  id: number;
  planDate: string;
  /** Кому объезжать. Пустая строка — план ничей. */
  assignee: string;
  author: string;
  source: string;
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
}): Promise<{ id: number; stops: number }> {
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

    return { id: plan.id, stops: unique.length };
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
      doneCount: stops.filter((s) => s.done).length,
    };
  });
}

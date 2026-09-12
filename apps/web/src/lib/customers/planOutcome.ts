import { prisma } from '@repo/database';

import { localDayRange } from '@/lib/localDate';
import { markIndex, markKey } from './planDone';
import { VISIT_WHERE } from './visits';

// ══════════════════════════════════════════════════════════════════════
// Чем кончился объезд — сигнал владельцу.
//
// ЧЕГО НЕ БЫЛО. Владелец узнавал об итоге дня, только если сам открывал
// экран объездов и считал глазами. Колокольчик админки при этом уже есть и
// уже читает `owner_alerts` — туда пишут боты офиса. Заводить ради этого
// второй канал незачем.
//
// СИГНАЛ РАЗ НА СОБЫТИЕ. `kind` включает дату и человека, а перед записью
// проверяется, не было ли уже такого: без этого каждая отметка визита у
// последней точки слала бы владельцу «объезд закончен» заново. Тот же
// приём, что в `alert_once.py` у офиса, — только память здесь в самой
// таблице, а не в Redis.
//
// «СОРВАН» НЕ ПИШЕМ ПО ХОДУ ДНЯ. Половина точек в четыре часа дня — это
// обычный рабочий день, а не срыв. Итог подводится один раз, вечером, и
// зовёт его сторож офиса; здесь только правило, что считать чем.
// ══════════════════════════════════════════════════════════════════════

/** Сколько из объезда должно быть пройдено, чтобы день считался закрытым. */
export const DONE_SHARE = 1;

export interface PlanOutcome {
  kind: 'done' | 'partial' | 'none';
  total: number;
  done: number;
}

/**
 * Чем кончился день по числам. Чистая функция — её и проверяют тесты.
 *
 * «Ни одной» отделено от «части» намеренно: это разные разговоры. Часть —
 * не успел, застрял, закрылись; ни одной — не поехал вовсе, и об этом
 * владелец должен узнать вечером, а не через неделю по выручке.
 */
export function planOutcome(total: number, done: number): PlanOutcome {
  if (total === 0) return { kind: 'none', total, done };
  if (done >= total * DONE_SHARE) return { kind: 'done', total, done };
  if (done === 0) return { kind: 'none', total, done };
  return { kind: 'partial', total, done };
}

/** Текст сигнала. Без оценок: числа говорят сами. */
export function outcomeText(assignee: string, outcome: PlanOutcome): {
  title: string;
  message: string;
  severity: string;
} {
  if (outcome.kind === 'done') {
    return {
      title: `${assignee}: объезд закончен`,
      message: `Все ${outcome.total} точек отмечены.`,
      severity: 'info',
    };
  }
  if (outcome.kind === 'none') {
    return {
      title: `${assignee}: объезд не начат`,
      message: `Из ${outcome.total} точек не отмечено ни одной.`,
      severity: 'warning',
    };
  }
  return {
    title: `${assignee}: объезд не закончен`,
    message: `Отмечено ${outcome.done} из ${outcome.total}.`,
    severity: 'warning',
  };
}

/**
 * Записать сигнал владельцу — если такого ещё не было.
 *
 * Ключ повторения — `kind`: он включает дату и человека, поэтому один и тот
 * же итог за один день пишется однажды, сколько бы раз проход ни звали.
 */
export async function raisePlanOutcome(
  assignee: string,
  outcome: PlanOutcome,
  day: string,
): Promise<boolean> {
  const kind = `visit.plan.${outcome.kind}:${day}:${assignee}`.slice(0, 48);

  const already = await prisma.ownerAlert.findFirst({ where: { kind }, select: { id: true } });
  if (already) return false;

  const text = outcomeText(assignee, outcome);
  await prisma.ownerAlert.create({
    data: {
      kind,
      severity: text.severity,
      title: text.title,
      message: text.message,
      source: 'visit-plans',
    },
  });
  return true;
}

/**
 * Подвести итоги дня по всем планам.
 *
 * Зовётся один раз вечером — сторожем офиса. Внутри дня подводить итог
 * нельзя: половина точек в четыре часа — это обычный день, а не срыв.
 */
export async function summarizeDay(day: string): Promise<number> {
  const { start } = localDayRange(day);

  const plans = await prisma.visitPlan.findMany({
    where: { planDate: start, assignee: { not: '' } },
    select: {
      assignee: true,
      stops: { select: { customerId: true } },
    },
  });
  if (plans.length === 0) return 0;

  const { start: from, end: to } = localDayRange(day);
  const visits = await prisma.interaction.findMany({
    where: {
      // ТОТ ЖЕ признак «это визит», что и у экрана объездов. Раньше здесь
      // отбирали по каналу, а на экране — по типу: два определения одного
      // понятия, которые совпадали лишь потому, что их пишет одна дверь.
      ...VISIT_WHERE,
      createdAt: { gte: from, lt: to },
      botName: { in: plans.map((p) => p.assignee) },
      customerId: { in: plans.flatMap((p) => p.stops.map((s) => s.customerId)) },
    },
    // Доказательство расстояния вечернему итогу не нужно — нужен факт.
    select: { customerId: true, botName: true, distanceM: true, accuracyM: true },
    orderBy: { createdAt: 'desc' },
  });
  const byMark = markIndex(visits);

  let written = 0;
  for (const plan of plans) {
    // Считаем ТОЛЬКО свои отметки: иначе объезд закрывался чужой поездкой к
    // тому же клиенту, и вечерний сигнал хвалил не того.
    const done = plan.stops.filter((s) => byMark.has(markKey(plan.assignee, s.customerId))).length;
    const outcome = planOutcome(plan.stops.length, done);
    if (await raisePlanOutcome(plan.assignee, outcome, day)) written += 1;
  }
  return written;
}

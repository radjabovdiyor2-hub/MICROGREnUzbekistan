import { prisma } from '@repo/database';
import { formatLocalDate, startOfLocalDay } from '@/lib/localDate';

// ══════════════════════════════════════════════════════════════════════
// Движение денег — не то же самое, что прибыль.
//
// ЗАЧЕМ ОТДЕЛЬНО ОТ P&L. Прибыль за месяц отвечает на вопрос «заработали
// ли». Движение денег отвечает на другой: «когда они были». Прибыльный
// месяц спокойно проходит через неделю, в которую платить нечем, — и
// именно в эту неделю срывается закупка семян.
//
// ЧТО ЗДЕСЬ НЕ ПОКАЗАНО И ПОЧЕМУ. Это НЕ остаток на счету. Сколько денег
// было на начало периода, система не знает: входящего сальдо в `finances`
// нет. Поэтому накопленная величина — ИЗМЕНЕНИЕ с начала периода, а не
// касса. Назвать её остатком значило бы показать число, которое не сходится
// с банком, и подорвать доверие ко всему отчёту.
//
// По деловой дате (`Finance.date`), а не по времени записи: расход,
// внесённый задним числом, иначе попал бы не в свой день.
// ══════════════════════════════════════════════════════════════════════

export interface CashFlowDay {
  /** Локальная дата ГГГГ-ММ-ДД. */
  date: string;
  inflow: number;
  outflow: number;
  /** Разница за день. */
  net: number;
  /** Накопленное ИЗМЕНЕНИЕ с начала периода, не остаток на счету. */
  change: number;
}

export interface CashFlow {
  days: CashFlowDay[];
  inflow: number;
  outflow: number;
  net: number;
  /** Самая глубокая просадка накопленного изменения за период. */
  worstChange: number;
}

export interface CashEntry {
  type: string;
  amount: number;
  date: Date;
}

/** Чистый расчёт: те же операции — то же движение. */
export function summarizeCashFlow(entries: CashEntry[]): CashFlow {
  const byDay = new Map<string, CashFlowDay>();

  for (const entry of entries) {
    const key = formatLocalDate(startOfLocalDay(entry.date));
    const day =
      byDay.get(key) ?? { date: key, inflow: 0, outflow: 0, net: 0, change: 0 };

    if (entry.type === 'income') day.inflow += entry.amount;
    else day.outflow += entry.amount;

    byDay.set(key, day);
  }

  const days = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));

  let running = 0;
  let worstChange = 0;
  let inflow = 0;
  let outflow = 0;

  for (const day of days) {
    day.net = day.inflow - day.outflow;
    running += day.net;
    day.change = running;
    if (running < worstChange) worstChange = running;
    inflow += day.inflow;
    outflow += day.outflow;
  }

  return { days, inflow, outflow, net: inflow - outflow, worstChange };
}

/** Собрать движение денег за период. */
export async function loadCashFlow(from: Date, to?: Date): Promise<CashFlow> {
  const rows = await prisma.finance.findMany({
    where: { date: to ? { gte: from, lte: to } : { gte: from } },
    select: { type: true, amount: true, date: true },
  });

  return summarizeCashFlow(
    rows.map((r) => ({ type: r.type, amount: Number(r.amount), date: r.date })),
  );
}

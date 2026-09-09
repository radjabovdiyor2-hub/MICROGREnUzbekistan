import { formatLocalDate, startOfLocalDay } from '@/lib/localDate';

import type { DebtLike } from './paymentCalendar';

// ══════════════════════════════════════════════════════════════════════
// Зарплата: сколько начислено, сколько человек уже взял и сколько
// осталось найти к дате выплаты.
//
// ЗАЧЕМ ОТДЕЛЬНО ОТ `Finance`. Расход с категорией `salary` в `finances`
// отвечает на вопрос «сколько ушло на зарплату в этом месяце». Он НЕ
// отвечает на вопрос «сколько взял Азиз до получки»: у записи расхода нет
// сотрудника, она связана только с заказом. Пока выплата не именная, аванс
// живёт в памяти владельца — и там же теряется, а в день выплаты
// выясняется, что половина суммы уже роздана.
//
// ПОЧЕМУ ВЫПЛАТЫ И НАЧИСЛЕНИЯ В ОДНОЙ ТАБЛИЦЕ, НО РАЗНОГО ВИДА.
// Аванс и окончательный расчёт — это движение денег. Премия и удержание —
// это изменение суммы, которую мы должны. Складывать их в одну колонку
// нельзя: премия не выданная на руки увеличивает долг перед сотрудником,
// а не уменьшает его. Вид выплаты (`kind`) и задаёт, куда пойдёт число.
//
// ЧТО ЗДЕСЬ НЕ СЧИТАЕТСЯ. Налоги и отчисления. Оклад берётся как есть из
// `Employee.baseSalary`, потому что именно эту сумму владелец держит в
// голове и именно ею оперирует при разговоре с сотрудником. Как только
// понадобится расчёт «на руки» против «начислено», это будет отдельный
// слой, а не тихая правка этой формулы.
// ══════════════════════════════════════════════════════════════════════

/**
 * Вид записи.
 *
 * `ADVANCE` и `SALARY` — деньги ушли из кассы. `BONUS` и `DEDUCTION`
 * денег не двигают, они меняют сумму к выплате.
 */
export type PayoutKind = 'ADVANCE' | 'SALARY' | 'BONUS' | 'DEDUCTION';

/** Запись о выплате в том виде, в каком её понимает расчёт. */
export interface PayoutLike {
  id: string;
  employeeId: string;
  /** Всегда положительная: направление задаёт `kind`, а не знак. */
  amount: number;
  kind: PayoutKind;
  /** Месяц, за который идёт выплата: любая дата внутри него. */
  period: Date;
}

export interface EmployeeLike {
  id: string;
  name: string;
  isActive: boolean;
  /** Оклад за месяц в сумах. `null` — оклад не задан. */
  baseSalary: number | null;
}

export interface PayrollRow {
  employeeId: string;
  name: string;
  isActive: boolean;
  /** Оклад за период. */
  base: number;
  /** Начислено сверх оклада. */
  bonuses: number;
  /** Удержано. */
  deductions: number;
  /** Взято авансом до дня выплаты. */
  advances: number;
  /** Выдано окончательным расчётом. */
  settled: number;
  /** Сколько денег человек уже получил из кассы за этот период. */
  paidTotal: number;
  /** Начислено всего: оклад плюс премии минус удержания. */
  accrued: number;
  /** Сколько ещё предстоит выплатить. Отрицательное — выдали лишнего. */
  remaining: number;
  /** Выдано больше, чем начислено: долг сотрудника перед нами. */
  overpaid: boolean;
}

export interface Payroll {
  /** Период в виде ГГГГ-ММ. */
  period: string;
  /** Дата выплаты в виде ГГГГ-ММ-ДД. */
  payday: string;
  /** Сколько дней осталось до выплаты. Отрицательное — день уже прошёл. */
  daysToPayday: number;
  rows: PayrollRow[];
  /** Начислено всем за период. */
  totalAccrued: number;
  /** Уже роздано за период. */
  totalPaid: number;
  /**
   * Сколько нужно найти к дате выплаты.
   *
   * Переплаты сюда НЕ засчитываются: лишнее, выданное одному, не
   * уменьшает того, что нужно отдать другому. Иначе в день выплаты
   * обнаруживается недостача ровно на размер чужой переплаты.
   */
  totalRemaining: number;
}

/** Первое число месяца, в который попадает дата. */
function periodKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Дата выплаты за период.
 *
 * Если в месяце нет такого числа (30-е в феврале), выплата сдвигается на
 * последний день месяца, а не переносится в следующий: зарплату за февраль
 * платят в феврале.
 */
export function paydayOf(period: string, payday: number): Date {
  const [y, m] = period.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return new Date(y, m - 1, Math.min(Math.max(1, payday), lastDay));
}

/**
 * Свести зарплату за период.
 *
 * Чистая функция: те же сотрудники, выплаты и «сегодня» — тот же расчёт.
 *
 * В список попадают все действующие сотрудники и, сверх того, уволенные,
 * у которых в этом периоде есть движения: человек, ушедший пятнадцатого,
 * половину месяца отработал, и не показать его — значит потерять долг.
 */
export function buildPayroll(
  employees: EmployeeLike[],
  payouts: PayoutLike[],
  period: string,
  today: Date,
  payday: number,
): Payroll {
  const inPeriod = payouts.filter((p) => periodKey(p.period) === period);
  const withMovement = new Set(inPeriod.map((p) => p.employeeId));

  const rows: PayrollRow[] = employees
    .filter((e) => e.isActive || withMovement.has(e.id))
    .map((e) => {
      const mine = inPeriod.filter((p) => p.employeeId === e.id);
      const sum = (kind: PayoutKind) =>
        mine.filter((p) => p.kind === kind).reduce((acc, p) => acc + Math.max(0, p.amount), 0);

      const base = Math.max(0, e.baseSalary ?? 0);
      const bonuses = sum('BONUS');
      const deductions = sum('DEDUCTION');
      const advances = sum('ADVANCE');
      const settled = sum('SALARY');

      const accrued = base + bonuses - deductions;
      const paidTotal = advances + settled;
      const remaining = accrued - paidTotal;

      return {
        employeeId: e.id,
        name: e.name,
        isActive: e.isActive,
        base,
        bonuses,
        deductions,
        advances,
        settled,
        paidTotal,
        accrued,
        remaining,
        overpaid: remaining < 0,
      };
    })
    .sort((a, b) => b.remaining - a.remaining);

  const due = paydayOf(period, payday);
  const todayStart = startOfLocalDay(today);
  const daysToPayday = Math.round(
    (startOfLocalDay(due).getTime() - todayStart.getTime()) / 86_400_000,
  );

  return {
    period,
    payday: formatLocalDate(due),
    daysToPayday,
    rows,
    totalAccrued: rows.reduce((acc, r) => acc + r.accrued, 0),
    totalPaid: rows.reduce((acc, r) => acc + r.paidTotal, 0),
    totalRemaining: rows.reduce((acc, r) => acc + Math.max(0, r.remaining), 0),
  };
}

/**
 * Превратить остаток зарплаты в обязательства платёжного календаря.
 *
 * ЗАЧЕМ. Календарь отвечает на вопрос «хватит ли денег к двадцатому», но
 * до сих пор считал его без самой крупной регулярной выплаты: зарплата
 * попадала в систему постфактум расходом в `finances`, когда деньги уже
 * ушли. Разрыв в неделю выплаты был не виден ровно до дня выплаты.
 *
 * Каждый сотрудник идёт отдельной строкой, а не общей суммой: в разрыв
 * решают по именам — кому отдать сегодня, с кем поговорить.
 *
 * `critical` проставляется всем: это платёж, который не двигают.
 */
export function payrollObligations(payroll: Payroll): DebtLike[] {
  const due = new Date(`${payroll.payday}T00:00:00`);
  return payroll.rows
    .filter((r) => r.remaining > 0)
    .map((r) => ({
      id: `payroll:${payroll.period}:${r.employeeId}`,
      type: 'WE_OWE' as const,
      personName: r.name,
      amount: r.remaining,
      paidAmount: 0,
      dueDate: due,
      isPaid: false,
      critical: true,
    }));
}

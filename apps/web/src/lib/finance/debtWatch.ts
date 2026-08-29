import { prisma } from '@repo/database';
import { startOfLocalDay } from '@/lib/localDate';

// ══════════════════════════════════════════════════════════════════════
// Сигнал о просроченной дебиторке.
//
// ЗАЧЕМ. Заведения платят с отсрочкой, и при десятке точек незакрытая
// оплата теряется среди активных клиентов: долг не пропадает из базы, но
// перестаёт попадаться на глаза. Напоминать о нём раз в неделю — значит
// оказаться в очереди последним.
//
// ПОЧЕМУ ОДНО ОПОВЕЩЕНИЕ, А НЕ ПО ОДНОМУ НА ДОЛГ. Просрочка приходит
// пачками — заведения пропускают оплату в одни и те же дни месяца. Сигнал
// на каждый долг превратил бы вкладку в ленту одинаковых строк, то есть в
// шум, который перестают читать. Образец гашения повторов взят у
// `orders/crmAlert.ts`.
//
// Проверяются только долги В НАШУ СТОРОНУ (`WHO_OWES_US`). О собственных
// просроченных платежах владелец узнаёт от поставщика в тот же день —
// напоминать ему об этом бессмысленно, а вот платёжный календарь их
// показывает заранее (`paymentCalendar.ts`).
// ══════════════════════════════════════════════════════════════════════

/**
 * Одно оповещение в сутки: проверка живёт в суточном расписании, и чаще
 * напоминать не о чем — за день просрочка не меняется.
 */
const QUIET_MS = 20 * 60 * 60 * 1000;

const KIND = 'debt_overdue';

const money = (n: number) => `${Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ')} сум`;

export interface OverdueSummary {
  count: number;
  total: number;
  /** Самый долгий долг — с него разумно начинать разговор. */
  oldestName: string | null;
  oldestDays: number;
}

/** Посчитать просроченное к получению на указанный день. */
export async function collectOverdue(today = new Date()): Promise<OverdueSummary> {
  const startOfToday = startOfLocalDay(today);

  const debts = await prisma.debt.findMany({
    where: {
      type: 'WHO_OWES_US',
      isPaid: false,
      dueDate: { not: null, lt: startOfToday },
    },
    select: { personName: true, amount: true, paidAmount: true, dueDate: true },
    orderBy: { dueDate: 'asc' },
  });

  let total = 0;
  let count = 0;
  let oldestName: string | null = null;
  let oldestDays = 0;

  for (const debt of debts) {
    const remaining = Math.max(0, debt.amount - debt.paidAmount);
    // Долг с нулевым остатком просрочкой не является: деньги получены,
    // а галочку «закрыт» просто не поставили.
    if (remaining <= 0) continue;

    total += remaining;
    count += 1;

    if (oldestName === null && debt.dueDate) {
      oldestName = debt.personName;
      oldestDays = Math.floor((startOfToday.getTime() - startOfLocalDay(debt.dueDate).getTime()) / 86_400_000);
    }
  }

  return { count, total, oldestName, oldestDays };
}

/**
 * Поднять тревогу, если есть просроченные поступления.
 *
 * Никогда не бросает исключение: её зовут из суточного отчёта, и уронить
 * его из-за неудачной записи оповещения было бы хуже самой тишины.
 */
export async function alertOverdueDebts(today = new Date()): Promise<void> {
  try {
    const summary = await collectOverdue(today);
    if (summary.count === 0) return;

    const since = new Date(today.getTime() - QUIET_MS);
    const already = await prisma.ownerAlert.findFirst({
      where: { kind: KIND, createdAt: { gte: since } },
      select: { id: true },
    });
    if (already) return;

    const oldest =
      summary.oldestName && summary.oldestDays > 0
        ? ` Дольше всех тянет «${summary.oldestName}» — ${summary.oldestDays} дн.`
        : '';

    await prisma.ownerAlert.create({
      data: {
        kind: KIND,
        severity: summary.count > 3 ? 'critical' : 'warning',
        title: `Просрочена оплата: ${money(summary.total)}`,
        message:
          `Не оплачено в срок долгов: ${summary.count}, на ${money(summary.total)}.` +
          oldest +
          ' Напоминать нужно чаще, чем раз в неделю: кто напоминает реже, ' +
          'тому платят последним. Долги — вкладка «Долги», там же виден ' +
          'платёжный календарь и дни, где денег уходит больше, чем приходит.',
        source: 'web',
      },
    });
  } catch (err) {
    console.error('[debt] не удалось записать оповещение о просрочке:', err);
  }
}

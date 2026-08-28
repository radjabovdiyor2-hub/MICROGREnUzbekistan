import { prisma } from '@repo/database';
import { loadSalesLedger } from '@/lib/revenue/salesLedger';
import { VISIT_TYPES } from './visits';

// ══════════════════════════════════════════════════════════════════════
// Стоимость привлечения заведения — в заходах, а не в деньгах.
//
// ЗАЧЕМ. Вопрос «сколько стоит новый клиент» на нынешнем этапе деньгами не
// отвечается: реклама почти не покупается, а привлечение — это ноги и
// топливо. Практичная форма другая: СКОЛЬКО ЗАХОДОВ ПРИХОДИТСЯ НА ОДНО
// СОГЛАСИВШЕЕСЯ ЗАВЕДЕНИЕ. Число говорит, сколько дверей надо открыть
// ради одной, и по нему планируется объезд.
//
// Само по себе оно не значит ничего. Восемь заходов на клиента — много
// или мало, зависит от того, что клиент приносит. Поэтому рядом всегда
// стоит вторая величина: выручка заведения за первые полгода.
//
// ГЛАВНАЯ ЧЕСТНОСТЬ ЗДЕСЬ — НЕ УСРЕДНЯТЬ НЕДОЗРЕВШЕЕ. Заведение,
// согласившееся две недели назад, полугода ещё не прожило. Включить его в
// среднее «за полгода» — значит поделить двухнедельную выручку на
// полугодовой знаменатель и получить занижение тем большее, чем быстрее
// растёт база. Такие заведения считаются отдельно и в среднее не входят.
// ══════════════════════════════════════════════════════════════════════

/** Полгода в днях — горизонт, на котором меряется отдача от заведения. */
export const MATURITY_DAYS = 182;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface VisitTouch {
  customerId: number;
  at: Date;
}

/** Заведение согласилось: дата ПЕРВОГО заказа, а не смены статуса.
 *  Статус ставится рукой и запаздывает, заказ — факт. */
export interface Win {
  customerId: number;
  wonAt: Date;
}

export interface RevenueLine {
  customerId: number;
  amount: number;
  at: Date;
}

export interface Acquisition {
  /** Всего заходов за период. */
  visits: number;
  /** В скольких заведениях побывали. */
  venues: number;
  /** Сколько из них сделали первый заказ. */
  won: number;
  /**
   * Заходов на одно согласившееся заведение.
   *
   * `null`, когда не согласился никто: делить на ноль нельзя, а «0 заходов
   * на клиента» читалось бы как блестящий результат вместо его отсутствия.
   */
  visitsPerWin: number | null;
  /** У скольких согласившихся полгода уже прошло. */
  matured: number;
  /**
   * Средняя выручка заведения за первые полгода — только по дозревшим.
   *
   * `null`, пока ни одно заведение не прожило полгода. Показать здесь
   * число, посчитанное по двум неделям, значит соврать в меньшую сторону.
   */
  revenuePerWon: number | null;
}

/**
 * Свести заходы, согласия и выручку в две сопоставимые величины.
 *
 * Заходы считаются ПО ВСЕМ переданным касаниям, включая те, что пришлись
 * на уже согласившееся заведение: повторный заезд к клиенту — это тоже
 * потраченный день, и прятать его значило бы приукрасить стоимость.
 */
export function summarizeAcquisition(
  input: { visits: VisitTouch[]; wins: Win[]; revenue: RevenueLine[] },
  today: Date,
): Acquisition {
  // Первый заход в каждое заведение — граница, до которой объезд к его
  // покупкам непричастен.
  const firstVisit = new Map<number, number>();
  for (const v of input.visits) {
    const known = firstVisit.get(v.customerId);
    if (known === undefined || v.at.getTime() < known) {
      firstVisit.set(v.customerId, v.at.getTime());
    }
  }

  // Согласия считаем только по тем, к кому ездили, и только если первая
  // покупка случилась ПОСЛЕ первого захода. Заведение, покупавшее и до
  // объезда, — действующий клиент: поездка к нему была обслуживанием, а
  // не привлечением, и записать её в заслугу ног значило бы завысить
  // отдачу ровно на тех, кого и уговаривать не пришлось.
  const wins = input.wins.filter((w) => {
    const since = firstVisit.get(w.customerId);
    return since !== undefined && w.wonAt.getTime() >= since;
  });

  const earned = new Map<number, number>();
  let matured = 0;

  for (const win of wins) {
    if (today.getTime() - win.wonAt.getTime() < MATURITY_DAYS * DAY_MS) continue;
    matured += 1;

    const until = win.wonAt.getTime() + MATURITY_DAYS * DAY_MS;
    const sum = input.revenue
      .filter(
        (r) =>
          r.customerId === win.customerId &&
          r.at.getTime() >= win.wonAt.getTime() &&
          r.at.getTime() < until,
      )
      .reduce((total, r) => total + r.amount, 0);

    earned.set(win.customerId, sum);
  }

  const totalEarned = [...earned.values()].reduce((sum, v) => sum + v, 0);

  return {
    visits: input.visits.length,
    venues: firstVisit.size,
    won: wins.length,
    visitsPerWin: wins.length > 0 ? input.visits.length / wins.length : null,
    matured,
    revenuePerWon: matured > 0 ? totalEarned / matured : null,
  };
}

// ── Загрузка из базы ──────────────────────────────────────────────────

/**
 * Собрать стоимость привлечения за период по фактическим данным.
 *
 * Заходы берутся из `interactions` с типами `visit_*` — той же таблицы,
 * куда пишет отметка визита с карты. Своего журнала поездок нет и не
 * нужно: он развёл бы историю общения по двум местам.
 *
 * Первая покупка ищется ПО ВСЕЙ истории, а не внутри периода. Иначе
 * заведение, купившее до его начала, каждый раз выглядело бы новым — и
 * стоимость привлечения падала бы тем сильнее, чем короче отчёт.
 */
export async function loadAcquisition(from: Date, today: Date): Promise<Acquisition> {
  const touches = await prisma.interaction.findMany({
    where: {
      interactionType: { in: VISIT_TYPES },
      createdAt: { gte: from },
      customerId: { not: null },
    },
    select: { customerId: true, createdAt: true },
  });

  const visits: VisitTouch[] = touches
    .filter((t): t is { customerId: number; createdAt: Date } => t.customerId !== null)
    .map((t) => ({ customerId: t.customerId, at: t.createdAt }));

  if (visits.length === 0) {
    return { visits: 0, venues: 0, won: 0, visitsPerWin: null, matured: 0, revenuePerWon: null };
  }

  const ids = [...new Set(visits.map((v) => v.customerId))];

  // Первая покупка заведения — по обоим каналам сразу. Касса пишет
  // деловую дату (`soldAt`), витрина — время заказа; берётся раннее.
  const [posFirst, webUsers] = await Promise.all([
    prisma.posSale.groupBy({
      by: ['customerId'],
      where: { customerId: { in: ids }, kind: 'sale' },
      _min: { soldAt: true },
    }),
    prisma.customer.findMany({
      where: { id: { in: ids }, webUserId: { not: null } },
      select: { id: true, webUserId: true },
    }),
  ]);

  const byWebUser = new Map(webUsers.map((c) => [c.webUserId as string, c.id]));

  const onlineFirst =
    byWebUser.size === 0
      ? []
      : await prisma.order.groupBy({
          by: ['userId'],
          where: {
            userId: { in: [...byWebUser.keys()] },
            status: { not: 'CANCELLED' },
            paymentStatus: { not: 'REFUNDED' },
          },
          _min: { createdAt: true },
        });

  const firstBuy = new Map<number, Date>();
  const remember = (customerId: number | null | undefined, at: Date | null) => {
    if (customerId == null || at === null) return;
    const known = firstBuy.get(customerId);
    if (known === undefined || at < known) firstBuy.set(customerId, at);
  };

  for (const row of posFirst) remember(row.customerId, row._min.soldAt);
  for (const row of onlineFirst) {
    remember(row.userId === null ? null : byWebUser.get(row.userId), row._min.createdAt);
  }

  const wins: Win[] = [...firstBuy.entries()].map(([customerId, wonAt]) => ({ customerId, wonAt }));

  // Выручка нужна с самой ранней первой покупки: полугодовое окно каждого
  // заведения начинается от своей даты, а не от начала отчёта.
  const earliest = wins.reduce<Date | null>(
    (min, w) => (min === null || w.wonAt < min ? w.wonAt : min),
    null,
  );

  const revenue: RevenueLine[] = [];
  if (earliest !== null) {
    const ledger = await loadSalesLedger(earliest);
    for (const sale of ledger.sales) {
      if (sale.customerId === null) continue;
      revenue.push({ customerId: sale.customerId, amount: sale.revenue, at: sale.at });
    }
  }

  return summarizeAcquisition({ visits, wins, revenue }, today);
}

'use client';

// ══════════════════════════════════════════════════════════════════════
// Ритм заказов клиента за полгода — рукописный SVG.
//
// Библиотеки графиков в проекте нет ни одной, и заводить её ради
// девяноста строк незачем: тот же приём, что у MonthlyChart в
// AdminAnalyticsCharts.
//
// Главное здесь — пустые недели. Их рисуем тонкой риской на базовой
// линии, а не пропускаем: провалы и есть та самая история «давно не
// заказывал», ради которой график вообще нужен. График из одних только
// непустых недель показал бы ровный частокол и соврал бы.
// ══════════════════════════════════════════════════════════════════════

const WEEKS = 26;
const WIDTH = 260;
const HEIGHT = 48;
const GAP = 1.5;

interface Props {
  /** Заказы клиента: дата и сумма. Порядок не важен. */
  orders: { createdAt: string; total: number }[];
  /** Цвет последнего столбика — текущее состояние клиента. */
  stateToken: string;
  now?: Date;
}

/** Суммы по неделям, от давних к свежим. Длина всегда WEEKS. */
export function weeklyTotals(
  orders: { createdAt: string; total: number }[],
  now: Date,
): number[] {
  const buckets = new Array<number>(WEEKS).fill(0);
  const weekMs = 7 * 86_400_000;

  for (const order of orders) {
    const at = new Date(order.createdAt).getTime();
    if (Number.isNaN(at)) continue;
    const weeksAgo = Math.floor((now.getTime() - at) / weekMs);
    if (weeksAgo < 0 || weeksAgo >= WEEKS) continue;
    buckets[WEEKS - 1 - weeksAgo] += order.total;
  }
  return buckets;
}

export function CustomerOrdersSparkline({ orders, stateToken, now }: Props) {
  const totals = weeklyTotals(orders, now ?? new Date());
  const max = Math.max(...totals, 1);
  const barWidth = (WIDTH - GAP * (WEEKS - 1)) / WEEKS;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      height={HEIGHT}
      role="img"
      aria-label="Заказы по неделям за полгода"
      style={{ display: 'block' }}
    >
      {totals.map((value, i) => {
        const x = i * (barWidth + GAP);
        const isLast = i === totals.length - 1;
        // Пустая неделя — риска в 1.5px у основания, а не пропуск.
        const height = value > 0 ? Math.max(3, (value / max) * (HEIGHT - 4)) : 1.5;
        return (
          <rect
            key={i}
            x={x}
            y={HEIGHT - height}
            width={barWidth}
            height={height}
            rx={1}
            fill={value > 0 && isLast ? stateToken : value > 0 ? 'var(--brand-primary)' : 'var(--border)'}
          />
        );
      })}
    </svg>
  );
}

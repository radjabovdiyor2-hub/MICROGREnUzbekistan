// Формы строк объезда дня. Вынесены отдельно, потому что сам компонент
// упирался в лимит 200 строк, а типы читают и он, и экран дня.

export interface PlanStopRow {
  customerId: number;
  name: string;
  done: boolean;
  distanceM: number | null;
  accuracyM: number | null;
  /** Приезд по треку — ручное «я на точке». `null` — не отмечался. */
  arrivedAt: string | null;
  /** Сколько простоял, секунды. `null` — ещё там либо не отметил отъезд. */
  dwellSec: number | null;
}

/** Что взято с собой: товар и сколько. Пустой список — объезд без развоза. */
export interface PlanItemRow {
  productId: string;
  name: string;
  qty: number;
  unit: string | null;
}

export interface PlanRow {
  id: number;
  assignee: string;
  author: string;
  source: string;
  /** Когда исполнитель подтвердил, что увидел. `null` — не подтвердил. */
  acceptedAt?: string | null;
  doneCount: number;
  stops: PlanStopRow[];
  items?: PlanItemRow[];
}

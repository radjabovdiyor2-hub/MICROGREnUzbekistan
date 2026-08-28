// ══════════════════════════════════════════════════════════════════════
// Этапы воронки клиента — один словарь на витрину и на офис.
//
// ЗАЧЕМ. Поле `Customer.status` принимало что угодно: правка карточки
// писала в него присланную строку без проверки. Опечатка или новое слово
// из чужого кода создавали статус, которого нет ни в одном фильтре, и
// карточка выпадала из списков молча — как это уже случилось со статьями
// расходов (см. `lib/finance/categories.ts`).
//
// СЛОВАРЬ НЕ ПРИДУМАН ЗАНОВО, А ЗАКРЕПЛЁН ПО ФАКТУ. Эти же три значения
// читает и пишет офис: `apps/tgas/shared/customer_repo.py` подставляет
// 'lead' по умолчанию, админка фильтрует по ['lead', 'active'] и 'vip'.
// Ввести здесь свои названия этапов значило бы рассинхронизировать модули,
// которые общаются через одну базу.
//
// Меняете список тут — меняйте и в офисе.
// ══════════════════════════════════════════════════════════════════════

/** Порядок значим: это последовательность воронки, а не просто набор. */
export const CUSTOMER_STATUSES = ['lead', 'active', 'vip'] as const;

export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const STATUS_LABELS: Record<CustomerStatus, { ru: string; uz: string }> = {
  lead: { ru: 'Лид', uz: 'Lid' },
  active: { ru: 'Активный', uz: 'Faol' },
  vip: { ru: 'Постоянный', uz: 'Doimiy' },
};

export function isCustomerStatus(value: unknown): value is CustomerStatus {
  return typeof value === 'string' && (CUSTOMER_STATUSES as readonly string[]).includes(value);
}

export interface FunnelStage {
  status: CustomerStatus;
  label: string;
  count: number;
  /** Доля от всех клиентов. */
  share: number;
  /**
   * Доля перешедших с предыдущего этапа.
   *
   * `null` у первого этапа: до него перехода нет. Ноль и null здесь значат
   * разное — ноль означает «никто не перешёл», а это уже диагноз.
   */
  conversion: number | null;
}

/**
 * Разложить клиентов по этапам воронки.
 *
 * Считается по ТЕКУЩЕМУ распределению, а не по переходам: истории смены
 * статуса в базе не велось, и восстановить её задним числом неоткуда.
 * Аудит смены статуса включён вместе с этим модулем — переходы можно будет
 * считать начиная с сегодняшнего дня, но задним числом их не появится.
 */
export function summarizeFunnel(counts: Record<string, number>): FunnelStage[] {
  const total = CUSTOMER_STATUSES.reduce((sum, s) => sum + (counts[s] ?? 0), 0);

  return CUSTOMER_STATUSES.map((status, index) => {
    const count = counts[status] ?? 0;
    const previous = index === 0 ? null : counts[CUSTOMER_STATUSES[index - 1]] ?? 0;

    return {
      status,
      label: STATUS_LABELS[status].ru,
      count,
      share: total > 0 ? count / total : 0,
      conversion: previous === null ? null : previous > 0 ? count / previous : 0,
    };
  });
}

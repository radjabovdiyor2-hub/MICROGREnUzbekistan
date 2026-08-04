// ══════════════════════════════════════════════════════════════════════
// Статьи доходов и расходов — один список на витрину и на Telegram-бота.
//
// ЗАЧЕМ. Поле статьи в админке было свободным текстом, а бот финансов пишет
// фиксированные слаги (apps/tgas/bots/finance_bot/keyboards/inline.py:29-46).
// Владелец писал «аренда», бот писал `rent` — и отчёт по категориям показывал
// две несвязанные строки в одном P&L. Ошибки при этом не возникало никогда:
// расхождение просто копилось.
//
// Слаги здесь ОБЯЗАНЫ совпадать с набором бота. Меняете тут — меняйте там.
// ══════════════════════════════════════════════════════════════════════

export interface FinanceCategory {
  value: string;
  label: string;
}

export const EXPENSE_CATEGORIES: FinanceCategory[] = [
  { value: 'salary', label: 'Зарплата' },
  { value: 'rent', label: 'Аренда' },
  { value: 'marketing', label: 'Маркетинг' },
  { value: 'supplies', label: 'Закупка сырья и расходников' },
  { value: 'taxes', label: 'Налоги' },
  { value: 'other', label: 'Прочее' },
];

export const INCOME_CATEGORIES: FinanceCategory[] = [
  { value: 'sales', label: 'Продажи' },
  { value: 'investment', label: 'Инвестиции' },
  { value: 'other', label: 'Прочее' },
];

/** Служебная статья: сторно дохода по отменённому заказу (пишет офис). */
export const SYSTEM_CATEGORIES = ['sales_cancelled'];

export function categoriesFor(type: string): FinanceCategory[] {
  return type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

export function isKnownCategory(type: string, category: string): boolean {
  if (SYSTEM_CATEGORIES.includes(category)) return true;
  return categoriesFor(type).some((c) => c.value === category);
}

/** Человеческое название для отчётов; неизвестный слаг показываем как есть. */
export function categoryLabel(category: string): string {
  const all = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
  return all.find((c) => c.value === category)?.label ?? category;
}

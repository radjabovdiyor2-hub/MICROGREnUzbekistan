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

/**
 * Постоянный расход не зависит от объёма продаж, переменный — зависит.
 *
 * Критерий именно такой, а не «меняется ли сумма от месяца к месяцу»:
 * аренда может подорожать, оставаясь постоянной, а закупка семян при нулевых
 * продажах не исчезнет только потому, что она переменная — она станет нулевой.
 */
export type CostKind = 'fixed' | 'variable';

export interface FinanceCategory {
  value: string;
  label: string;
  /** Только у расходов: доходы на постоянные и переменные не делятся. */
  kind?: CostKind;
}

export const EXPENSE_CATEGORIES: FinanceCategory[] = [
  // Оклад не зависит от того, сколько лотков продано. Перейдёте на сдельную
  // оплату — статья станет переменной, и разметку здесь надо поменять.
  // Отдельного признака на самой записи сознательно нет: пока сотрудников
  // нет, это усложнение не окупается.
  { value: 'salary', label: 'Зарплата', kind: 'fixed' },
  { value: 'rent', label: 'Аренда', kind: 'fixed' },
  { value: 'marketing', label: 'Маркетинг', kind: 'fixed' },
  { value: 'supplies', label: 'Закупка сырья и расходников', kind: 'variable' },
  { value: 'taxes', label: 'Налоги', kind: 'variable' },
  { value: 'other', label: 'Прочее', kind: 'fixed' },
];

export const INCOME_CATEGORIES: FinanceCategory[] = [
  { value: 'sales', label: 'Продажи' },
  { value: 'investment', label: 'Инвестиции' },
  { value: 'other', label: 'Прочее' },
];

/**
 * Статьи, за которыми стоит ЗАКУПКА ЗАПАСА, а не расход периода.
 *
 * Их стоимость доходит до отчётов вторым путём — через себестоимость
 * проданного (`SaleLine.cost`). Сложить закупку с себестоимостью значит
 * посчитать один и тот же мешок семян дважды: сначала когда его купили,
 * потом когда продали выращенное из него.
 *
 * Поэтому в расчёте маржинальности эти статьи исключаются: за них отвечает
 * себестоимость. См. `breakEven.ts`.
 */
export const INVENTORY_CATEGORIES = ['supplies'];

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

/**
 * Постоянный расход или переменный — для точки безубыточности.
 *
 * НЕИЗВЕСТНАЯ СТАТЬЯ СЧИТАЕТСЯ ПОСТОЯННОЙ, И ЭТО НАМЕРЕННО.
 *
 * В `finances` попадают слаги от бота и из прошлых версий админки, которых
 * в списке выше может не оказаться. Ошибиться тут можно в две стороны, и они
 * не равнозначны: лишний расход в постоянных ЗАВЫШАЕТ точку безубыточности,
 * то есть говорит «продать надо больше, чем на самом деле». Лишний расход в
 * переменных — занижает её и обещает выход в ноль, которого не будет.
 *
 * Из двух ошибок выбрана та, что заставляет работать больше, а не та, что
 * успокаивает.
 */
export function costKind(category: string): CostKind {
  return EXPENSE_CATEGORIES.find((c) => c.value === category)?.kind ?? 'fixed';
}

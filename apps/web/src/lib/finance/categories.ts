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
 * Постоянный расход приходит независимо от продаж, переменный растёт
 * вместе с ними. Деление нужно точке безубыточности (`breakEven.ts`) и
 * только расходам: у дохода постоянной и переменной стороны нет.
 */
export type CostKind = 'fixed' | 'variable';

export interface FinanceCategory {
  value: string;
  label: string;
  /** Только у расходных статей. У доходных — `undefined`, и это намеренно. */
  kind?: CostKind;
}

export const EXPENSE_CATEGORIES: FinanceCategory[] = [
  // Оклад, аренда и рекламный бюджет приходят и в месяц без единой продажи.
  { value: 'salary', label: 'Зарплата', kind: 'fixed' },
  { value: 'rent', label: 'Аренда', kind: 'fixed' },
  { value: 'marketing', label: 'Маркетинг', kind: 'fixed' },
  // Закупка растёт вместе с продажами: больше продали — больше посеяли.
  { value: 'supplies', label: 'Закупка сырья и расходников', kind: 'variable' },
  // Налог с оборота считается от выручки, поэтому переменный.
  { value: 'taxes', label: 'Налоги', kind: 'variable' },
  // «Прочее» — постоянное по той же причине, что и неизвестная статья ниже.
  { value: 'other', label: 'Прочее', kind: 'fixed' },
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

/**
 * Статьи, которые НЕ прибавляются к переменным расходам в точке
 * безубыточности: они уже придут туда себестоимостью проданного.
 *
 * Закупка семян и себестоимость выращенного из них — один и тот же мешок,
 * показанный дважды: сначала при оплате поставщику, потом при продаже.
 * Сложить их значит завысить переменные расходы и получить точку выше
 * настоящей — то есть решить, что бизнес убыточен, когда он прибылен.
 */
export const INVENTORY_CATEGORIES: string[] = ['supplies'];

/**
 * Постоянная статья или переменная.
 *
 * Неизвестная — ПОСТОЯННАЯ, и это осознанная ошибка в безопасную сторону.
 * Переменная статья уменьшает маржу и поднимает точку безубыточности,
 * постоянная — поднимает её тоже, но не искажает маржу, по которой потом
 * считают каждый следующий месяц. Занизить точку опаснее, чем завысить:
 * первое звучит как «мы в плюсе» тогда, когда это неправда.
 */
export function costKind(category: string): CostKind {
  return EXPENSE_CATEGORIES.find((c) => c.value === category)?.kind ?? 'fixed';
}

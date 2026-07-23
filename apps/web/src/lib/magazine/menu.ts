// ════════════════════════════════════════════════════════════
// «Живое меню» — категории блюд и форматирование цены.
// Используется мобильными роутами /m/[slug] и админ-вкладкой меню.
// Сам журнал собирается отдельно (внешний редактор), поэтому печатных
// структур здесь больше нет — только доменные справочники.
// ════════════════════════════════════════════════════════════

export const DISH_CATEGORIES = ['starter', 'main', 'dessert', 'drink'] as const;
export type DishCategory = (typeof DISH_CATEGORIES)[number];

export const DISH_CATEGORY_LABELS: Record<DishCategory, { ru: string; uz: string }> = {
  starter: { ru: 'Закуски', uz: 'Salatlar' },
  main: { ru: 'Горячее', uz: 'Issiq taomlar' },
  dessert: { ru: 'Десерты', uz: 'Shirinliklar' },
  drink: { ru: 'Напитки', uz: 'Ichimliklar' },
};

export function isDishCategory(v: string): v is DishCategory {
  return (DISH_CATEGORIES as readonly string[]).includes(v);
}

// Цена в сумах: 145000 → «145 000». Узкий неразрывный пробел, чтобы
// число не разрывалось по строкам.
export function formatPrice(price?: number | null): string | null {
  if (price == null) return null;
  return `${price.toLocaleString('ru-RU').replace(/ /g, ' ')} so'm`;
}

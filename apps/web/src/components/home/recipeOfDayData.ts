// Рубрики блюда дня и форма рецепта. Вынесено из RecipeOfDay —
// чистые данные без состояния.

export const CATEGORY_ICONS: Record<string, { label: string; colorFrom: string; colorTo: string }> = {
  breakfast: { label: 'B', colorFrom: 'var(--warning)', colorTo: 'var(--accent-orange)' },
  salad: { label: 'S', colorFrom: 'var(--brand-primary)', colorTo: 'var(--brand-primary-hover)' },
  smoothie: { label: 'D', colorFrom: 'var(--cat-2)', colorTo: 'var(--cat-1)' },
  snack: { label: 'N', colorFrom: 'var(--cat-3)', colorTo: 'var(--accent-rose)' },
  main: { label: 'M', colorFrom: 'var(--info)', colorTo: 'var(--info)' },
};

export interface Recipe {
  nameUz: string; nameRu: string; microgreens: string[];
  prepTime: number; servings: number; calories: number; protein: number;
  ingredientsUz: string[]; ingredientsRu: string[];
  stepsUz: string[]; stepsRu: string[];
  tipUz: string; tipRu: string; category: string;
  nutrition: { vitC: number; vitA: number; vitK: number; iron: number; calcium: number };
}

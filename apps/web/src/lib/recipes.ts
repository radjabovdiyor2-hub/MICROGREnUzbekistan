// ════════════════════════════════════════════════════════════
// Загрузка рецептов для публичных страниц /recipe/[slug] (server-only).
// Ключевая механика — «собрать набор микрозелени»: ингредиенты, связанные
// с товаром магазина, превращаются в позиции корзины.
// ════════════════════════════════════════════════════════════
import { prisma } from '@repo/database';

// Форма, совместимая с CartProduct из CartProvider — чтобы addItem() принял
// её без переработки. Держим синхронной с providers/CartProvider.tsx.
export interface RecipeCartProduct {
  id: string;
  nameUz: string;
  nameRu: string;
  price: number;
  oldPrice: number | null;
  /** «лоток» / «100 г» / «кг» — едет в корзину вместе с ценой. */
  unit?: string | null;
  slug: string;
  images: string[];
  category?: { nameUz: string; slug: string };
}

export interface RecipeIngredientView {
  id: string;
  nameRu: string;
  nameUz: string | null;
  amount: string | null;
  product: RecipeCartProduct | null;   // заполнен только для продаваемого
}

export interface RecipeView {
  id: string;
  slug: string;
  titleRu: string;
  titleUz: string | null;
  descriptionRu: string | null;
  descriptionUz: string | null;
  heroImage: string | null;
  cookMinutes: number | null;
  servings: number | null;
  steps: { id: string; order: number; textRu: string; textUz: string | null; image: string | null; timerSeconds: number | null }[];
  ingredients: RecipeIngredientView[];
}

/** Карточка рецепта для списков: хаб /recipe, «другие рецепты», блок на товаре. */
export interface RecipeCardView {
  slug: string;
  titleRu: string;
  titleUz: string | null;
  descriptionRu: string | null;
  heroImage: string | null;
  cookMinutes: number | null;
  servings: number | null;
}

const CARD_SELECT = {
  slug: true, titleRu: true, titleUz: true,
  descriptionRu: true, heroImage: true, cookMinutes: true, servings: true,
} as const;

/** Все активные рецепты — для хаба /recipe и блока «другие рецепты». */
export async function listRecipes(): Promise<RecipeCardView[]> {
  return prisma.recipe.findMany({
    where: { isActive: true },
    select: CARD_SELECT,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
}

/**
 * Рецепты, где товар указан ингредиентом — перелинковка товар → рецепт.
 * Идём по существующей связи RecipeIngredient.productId, новых полей не нужно.
 */
export async function recipesForProduct(productId: string, take = 4): Promise<RecipeCardView[]> {
  return prisma.recipe.findMany({
    where: { isActive: true, ingredients: { some: { productId } } },
    select: CARD_SELECT,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    take,
  });
}

function toCartProduct(p: {
  id: string; nameUz: string; nameRu: string; price: number; oldPrice: number | null;
  unit?: string | null;
  slug: string; images: string[]; category?: { nameUz: string; slug: string } | null;
}): RecipeCartProduct {
  return {
    id: p.id, nameUz: p.nameUz, nameRu: p.nameRu, price: p.price, oldPrice: p.oldPrice,
    unit: p.unit, slug: p.slug, images: p.images,
    category: p.category ? { nameUz: p.category.nameUz, slug: p.category.slug } : undefined,
  };
}

export async function loadRecipeBySlug(slug: string): Promise<RecipeView | null> {
  const recipe = await prisma.recipe.findUnique({
    where: { slug },
    include: {
      steps: { orderBy: { order: 'asc' } },
      ingredients: {
        orderBy: { order: 'asc' },
        include: { product: { include: { category: true } } },
      },
    },
  });
  if (!recipe || !recipe.isActive) return null;

  return {
    id: recipe.id,
    slug: recipe.slug,
    titleRu: recipe.titleRu,
    titleUz: recipe.titleUz,
    descriptionRu: recipe.descriptionRu,
    descriptionUz: recipe.descriptionUz,
    heroImage: recipe.heroImage,
    cookMinutes: recipe.cookMinutes,
    servings: recipe.servings,
    steps: recipe.steps.map((s) => ({
      id: s.id, order: s.order, textRu: s.textRu, textUz: s.textUz, image: s.image, timerSeconds: s.timerSeconds,
    })),
    ingredients: recipe.ingredients.map((i) => ({
      id: i.id,
      nameRu: i.nameRu,
      nameUz: i.nameUz,
      amount: i.amount,
      // Товар подставляем только если он активен — снятый с продажи в корзину не кладём
      product: i.product && i.product.isActive ? toCartProduct(i.product) : null,
    })),
  };
}

/** Товары рецепта для кнопки «собрать набор» (только связанные с магазином). */
export function recipeCartProducts(recipe: RecipeView): RecipeCartProduct[] {
  const seen = new Set<string>();
  const out: RecipeCartProduct[] = [];
  for (const ing of recipe.ingredients) {
    if (ing.product && !seen.has(ing.product.id)) {
      seen.add(ing.product.id);
      out.push(ing.product);
    }
  }
  return out;
}

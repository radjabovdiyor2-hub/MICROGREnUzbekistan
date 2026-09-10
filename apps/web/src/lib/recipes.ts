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

/** Блюдо вместе с зеленью, которую оно требует. */
export interface DishWithGreens {
  slug: string;
  titleRu: string;
  titleUz: string | null;
  heroImage: string | null;
  cookMinutes: number | null;
  /** Только продаваемая зелень: то, что можно положить в корзину. */
  greens: RecipeCartProduct[];
}

/**
 * Блюда, для которых у нас есть зелень.
 *
 * ОДНА ВЫБОРКА НА ДВА ЭКРАНА: страницу для закупщиков («как это выглядит
 * в блюдах») и подборщик «какую зелень добавить». Два запроса за одним и
 * тем же разошлись бы на первой правке — например, один продолжил бы
 * показывать блюдо, у которого зелень сняли с продажи.
 *
 * БЛЮДА БЕЗ ПРОДАВАЕМОЙ ЗЕЛЕНИ ОТСЕИВАЮТСЯ. Рецепт, к которому нечего
 * купить, на обоих экранах бесполезен: закупщику он ничего не говорит о
 * нашем товаре, а подборщику нечего предложить.
 */
export async function listDishesWithGreens(take = 12): Promise<DishWithGreens[]> {
  const rows = await prisma.recipe.findMany({
    where: { isActive: true, ingredients: { some: { productId: { not: null } } } },
    select: {
      slug: true, titleRu: true, titleUz: true, heroImage: true, cookMinutes: true,
      ingredients: {
        where: { productId: { not: null } },
        orderBy: { order: 'asc' },
        select: { product: { include: { category: true } } },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    take,
  });

  return rows
    .map((r) => {
      const seen = new Set<string>();
      const greens: RecipeCartProduct[] = [];
      for (const ing of r.ingredients) {
        // Снятый с продажи товар в корзину не кладём — та же проверка,
        // что и на странице рецепта.
        if (ing.product && ing.product.isActive && !seen.has(ing.product.id)) {
          seen.add(ing.product.id);
          greens.push(toCartProduct(ing.product));
        }
      }
      return {
        slug: r.slug, titleRu: r.titleRu, titleUz: r.titleUz,
        heroImage: r.heroImage, cookMinutes: r.cookMinutes, greens,
      };
    })
    .filter((d) => d.greens.length > 0);
}

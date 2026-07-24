import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMany = vi.fn().mockResolvedValue([]);
vi.mock('@repo/database', () => ({ prisma: { recipe: { findMany: (...a: unknown[]) => findMany(...a) } } }));

import { recipeCartProducts, listRecipes, recipesForProduct, type RecipeView } from './recipes';

const P = (id: string) => ({
  id, nameUz: 'x', nameRu: 'X', price: 10000, oldPrice: null, slug: id, images: [],
});

const base: RecipeView = {
  id: 'r', slug: 'test', titleRu: 'Т', titleUz: null, descriptionRu: null, descriptionUz: null,
  heroImage: null, cookMinutes: null, servings: null, steps: [], ingredients: [],
};

describe('recipes · recipeCartProducts', () => {
  it('берёт только связанные с товаром ингредиенты', () => {
    const recipe: RecipeView = {
      ...base,
      ingredients: [
        { id: 'i1', nameRu: 'Соль', nameUz: null, amount: null, product: null },
        { id: 'i2', nameRu: 'Руккола', nameUz: null, amount: '20 г', product: P('rukkola') },
        { id: 'i3', nameRu: 'Горох', nameUz: null, amount: null, product: P('noxat') },
      ],
    };
    expect(recipeCartProducts(recipe).map((p) => p.id)).toEqual(['rukkola', 'noxat']);
  });

  it('дедуплицирует один товар в разных ингредиентах', () => {
    const recipe: RecipeView = {
      ...base,
      ingredients: [
        { id: 'i1', nameRu: 'Руккола', nameUz: null, amount: '20 г', product: P('rukkola') },
        { id: 'i2', nameRu: 'Руккола ещё', nameUz: null, amount: '10 г', product: P('rukkola') },
      ],
    };
    expect(recipeCartProducts(recipe)).toHaveLength(1);
  });

  it('без товарных ингредиентов возвращает пусто (кнопка «собрать» скрыта)', () => {
    const recipe: RecipeView = {
      ...base,
      ingredients: [{ id: 'i1', nameRu: 'Соль', nameUz: null, amount: null, product: null }],
    };
    expect(recipeCartProducts(recipe)).toEqual([]);
  });
});

// Запросы списков проверяем по форме: локальной БД для e2e нет, а сломанный
// фильтр тихо отдаст пустой список и рецепты снова останутся без ссылок.
describe('recipes · списки для хаба и перелинковки', () => {
  beforeEach(() => findMany.mockClear());

  it('listRecipes берёт только активные, в порядке sortOrder', async () => {
    await listRecipes();
    const arg = findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ isActive: true });
    expect(arg.orderBy).toEqual([{ sortOrder: 'asc' }, { createdAt: 'desc' }]);
    expect(arg.select.slug).toBe(true);
  });

  it('recipesForProduct фильтрует по ингредиенту-товару и ограничивает выдачу', async () => {
    await recipesForProduct('prod-1');
    const arg = findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ isActive: true, ingredients: { some: { productId: 'prod-1' } } });
    expect(arg.take).toBe(4);
  });
});

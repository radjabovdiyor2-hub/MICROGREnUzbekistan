import { describe, it, expect } from 'vitest';
import { recipeCartProducts, type RecipeView } from './recipes';

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

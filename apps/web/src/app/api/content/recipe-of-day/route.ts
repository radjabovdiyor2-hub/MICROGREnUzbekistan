import { NextResponse } from 'next/server';
import { getRecipeForDay } from '../../ai/nutrition/route';

// ==========================================
// Shared "recipe of the day" for the content pipeline. The website generates the
// daily AI recipe; the office content_bot pulls this to publish, so the site,
// the AI nutritionist and social all reference ONE recipe. Returns both the
// structured recipe and a ready-to-post caption (ru/uz).
// ==========================================

interface RecipeLike {
  nameUz: string; nameRu: string;
  ingredientsUz: string[]; ingredientsRu: string[];
  stepsUz: string[]; stepsRu: string[];
  tipUz: string; tipRu: string;
  prepTime: number; servings: number; calories: number; protein: number;
}

function caption(r: RecipeLike, lang: 'ru' | 'uz'): string {
  const name = lang === 'ru' ? r.nameRu : r.nameUz;
  const ingredients = lang === 'ru' ? r.ingredientsRu : r.ingredientsUz;
  const steps = lang === 'ru' ? r.stepsRu : r.stepsUz;
  const tip = lang === 'ru' ? r.tipRu : r.tipUz;
  const head = lang === 'ru' ? '🍽 Рецепт дня' : '🍽 Kun retsepti';
  const ingH = lang === 'ru' ? 'Ингредиенты' : 'Masalliqlar';
  const stepH = lang === 'ru' ? 'Приготовление' : 'Tayyorlash';
  const tipH = lang === 'ru' ? '💡 Совет' : '💡 Maslahat';
  const meta = lang === 'ru'
    ? `⏱ ${r.prepTime} мин · 🍽 ${r.servings} порц. · ${r.calories} ккал · ${r.protein}г белка`
    : `⏱ ${r.prepTime} min · 🍽 ${r.servings} · ${r.calories} kkal · ${r.protein}g oqsil`;
  return [
    `${head}: ${name}`,
    meta,
    '',
    `${ingH}:`,
    ...ingredients.map((i) => `• ${i}`),
    '',
    `${stepH}:`,
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    tip ? `\n${tipH}: ${tip}` : '',
    '\n🌱 Microgreen Uzbekistan · microgreenuzbekistan.com',
  ].join('\n');
}

export async function GET() {
  const recipe = (await getRecipeForDay()) as unknown as RecipeLike;
  return NextResponse.json({
    recipe,
    captionRu: caption(recipe, 'ru'),
    captionUz: caption(recipe, 'uz'),
    url: `${process.env.NEXT_PUBLIC_URL || ''}/#recipe-section`,
  });
}

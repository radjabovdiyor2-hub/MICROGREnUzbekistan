import { NextRequest, NextResponse } from 'next/server';

import { NUTRITION_DB } from '@/lib/nutrition/nutritionDb';
import { getRecipeForDay, calculateNutrition } from '@/lib/nutrition/recipes';

// ==========================================
// AI Nutrition API
//
// Справочник культур, рецепты и расчёты лежат в lib/nutrition: в route.ts
// Next.js разрешает экспортировать только HTTP-обработчики.
// ==========================================

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'recipe';

  if (type === 'recipe') {
    const date = searchParams.get('date') || undefined;
    const recipe = await getRecipeForDay(date);
    return NextResponse.json({ recipe, allCrops: Object.keys(NUTRITION_DB).map(k => ({ key: k, nameUz: NUTRITION_DB[k].nameUz, nameRu: NUTRITION_DB[k].nameRu })) });
  }

  if (type === 'crops') {
    return NextResponse.json({ crops: Object.entries(NUTRITION_DB).map(([k, v]) => ({ key: k, ...v })) });
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const { items } = await request.json();
  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'Items required' }, { status: 400 });
  }
  const result = calculateNutrition(items);
  return NextResponse.json(result);
}

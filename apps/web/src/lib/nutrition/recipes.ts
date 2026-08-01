import { NUTRITION_DB, RECIPES } from './nutritionDb';

// Расчёт нутриентов и рецепт дня. Вынесено из api/ai/nutrition/route.ts.

export function recipeNutrition(microgreens: string[]) {
  const total = { vitC: 0, vitA: 0, vitK: 0, iron: 0, calcium: 0 };
  microgreens.forEach(mg => {
    const data = NUTRITION_DB[mg];
    if (data) {
      total.vitC += data.vitC * 0.2;
      total.vitA += data.vitA * 0.2;
      total.vitK += data.vitK * 0.2;
      total.iron += data.iron * 0.2;
      total.calcium += data.calcium * 0.2;
    }
  });
  return total;
}

// Deterministic daily recipe selection (static fallback catalogue).
export function getDailyRecipe(dateStr?: string) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
  const idx = dayOfYear % RECIPES.length;
  const recipe = RECIPES[idx];
  return { ...recipe, nutrition: recipeNutrition(recipe.microgreens), dayIndex: idx, source: 'static' };
}

// ==========================================
// AI RECIPE OF THE DAY (Gemini) — one fresh recipe per day, built around the
// microgreens the store actually sells (NUTRITION_DB keys). Cached in-memory per
// date so it's stable + cheap; the office content_bot pulls the same one so the
// site and social share a single "recipe of the day". Falls back to the static
// rotation if Gemini is unavailable or returns junk.
// ==========================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
const RECIPE_CATEGORIES = ['breakfast', 'salad', 'smoothie', 'snack', 'main'];

// Process-global cache so every route (site recipe, content endpoint, AI chat)
// shares ONE recipe per day even if Next bundles them separately.
const _g = globalThis as unknown as { __recipeCache?: { date: string; recipe: Record<string, unknown> } };

function todayKey(dateStr?: string): string {
  return (dateStr ? new Date(dateStr) : new Date()).toISOString().slice(0, 10);
}

async function generateAiRecipe(_dateStr?: string): Promise<Record<string, unknown> | null> {
  if (!GEMINI_API_KEY) return null;
  const crops = Object.entries(NUTRITION_DB).map(([k, v]) => `${k} (${v.nameRu})`).join(', ');
  const prompt = `Ты шеф-повар и нутрициолог бренда Microgreen Uzbekistan. Придумай ОДИН рецепт «блюдо дня» с микрозеленью.
Используй 1–4 вида микрозелени ТОЛЬКО из этого списка (в поле microgreens указывай КЛЮЧИ на латинице): ${crops}.
Ответь СТРОГО валидным JSON без markdown, по схеме:
{"nameUz":"","nameRu":"","microgreens":["ключ"],"prepTime":10,"servings":2,"calories":250,"protein":12,"ingredientsUz":[""],"ingredientsRu":[""],"stepsUz":[""],"stepsRu":[""],"tipUz":"","tipRu":"","category":"salad"}
category — одно из: breakfast, salad, smoothie, snack, main. Тексты на узбекском (латиница) и русском. Реалистичные ингредиенты и шаги.`;

  try {
    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const json = JSON.parse(raw.replace(/^```json/i, '').replace(/```$/, '').trim());

    // Validate + sanitise so the frontend contract always holds.
    const microgreens = (Array.isArray(json.microgreens) ? json.microgreens : [])
      .filter((m: unknown): m is string => typeof m === 'string' && !!NUTRITION_DB[m]);
    if (!json.nameRu || !microgreens.length || !Array.isArray(json.stepsRu) || !json.stepsRu.length) {
      return null;
    }
    const category = RECIPE_CATEGORIES.includes(json.category) ? json.category : 'salad';
    return {
      nameUz: String(json.nameUz || json.nameRu),
      nameRu: String(json.nameRu),
      microgreens,
      prepTime: Number(json.prepTime) || 10,
      servings: Number(json.servings) || 2,
      calories: Number(json.calories) || 200,
      protein: Number(json.protein) || 8,
      ingredientsUz: Array.isArray(json.ingredientsUz) ? json.ingredientsUz.map(String) : [],
      ingredientsRu: Array.isArray(json.ingredientsRu) ? json.ingredientsRu.map(String) : [],
      stepsUz: Array.isArray(json.stepsUz) ? json.stepsUz.map(String) : [],
      stepsRu: json.stepsRu.map(String),
      tipUz: String(json.tipUz || ''),
      tipRu: String(json.tipRu || ''),
      category,
      nutrition: recipeNutrition(microgreens),
      source: 'ai',
    };
  } catch {
    return null;
  }
}

// Today's recipe: AI (cached per day) with static fallback. Shared by the site
// and the office content_bot so both show the same "recipe of the day".
export async function getRecipeForDay(dateStr?: string): Promise<Record<string, unknown>> {
  const key = todayKey(dateStr);
  if (_g.__recipeCache && _g.__recipeCache.date === key) return _g.__recipeCache.recipe;
  const ai = await generateAiRecipe(dateStr);
  const recipe = ai || getDailyRecipe(dateStr);
  _g.__recipeCache = { date: key, recipe };
  return recipe;
}

/** Нутриенты, которые суммируются по всем культурам в порции. */
type NutrientTotals = {
  calories: number; protein: number; fat: number; carbs: number; fiber: number;
  vitC: number; vitA: number; vitK: number; vitE: number;
  iron: number; calcium: number; potassium: number; magnesium: number; zinc: number;
};

/** Строка расчёта по одной культуре: нутриенты плюс справочные поля. */
type NutritionRow = NutrientTotals & {
  crop: string;
  nameUz: string;
  nameRu: string;
  grams: number;
  antioxidantMultiplier: number;
  benefits: { uz: string; ru: string }[];
};

// Nutritionist calculation
export function calculateNutrition(items: { crop: string; grams: number }[]) {
  const total: NutrientTotals = { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, vitC: 0, vitA: 0, vitK: 0, vitE: 0, iron: 0, calcium: 0, potassium: 0, magnesium: 0, zinc: 0 };
  const details: NutritionRow[] = [];
  for (const item of items) {
    const db = NUTRITION_DB[item.crop];
    if (!db) continue;
    const mult = item.grams / 100;
    const row = {
      crop: item.crop, nameUz: db.nameUz, nameRu: db.nameRu, grams: item.grams,
      calories: +(db.calories * mult).toFixed(1), protein: +(db.protein * mult).toFixed(1),
      fat: +(db.fat * mult).toFixed(1), carbs: +(db.carbs * mult).toFixed(1),
      fiber: +(db.fiber * mult).toFixed(1), vitC: +(db.vitC * mult).toFixed(1),
      vitA: +(db.vitA * mult).toFixed(0), vitK: +(db.vitK * mult).toFixed(1),
      vitE: +(db.vitE * mult).toFixed(1), iron: +(db.iron * mult).toFixed(2),
      calcium: +(db.calcium * mult).toFixed(0), potassium: +(db.potassium * mult).toFixed(0),
      magnesium: +(db.magnesium * mult).toFixed(0), zinc: +(db.zinc * mult).toFixed(2),
      antioxidantMultiplier: db.antioxidantMultiplier,
      benefits: db.benefits,
    };
    details.push(row);
    for (const k of Object.keys(total) as (keyof typeof total)[]) {
      total[k] += row[k] as number;
    }
  }
  // Daily value percentages (based on adult RDI)
  const dv = {
    vitC: +((total.vitC / 90) * 100).toFixed(0),
    vitA: +((total.vitA / 900) * 100).toFixed(0),
    vitK: +((total.vitK / 120) * 100).toFixed(0),
    iron: +((total.iron / 18) * 100).toFixed(0),
    calcium: +((total.calcium / 1000) * 100).toFixed(0),
    potassium: +((total.potassium / 3500) * 100).toFixed(0),
  };
  return { total, details, dailyValuePercent: dv };
}


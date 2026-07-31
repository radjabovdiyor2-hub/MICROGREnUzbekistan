import { NextRequest, NextResponse } from 'next/server';

// ==========================================
// MICROGREEN NUTRITION DATABASE (per 100g)
// Source: USDA, Journal of Agricultural and Food Chemistry
// ==========================================
const NUTRITION_DB: Record<string, {
  nameUz: string; nameRu: string;
  calories: number; protein: number; fat: number; carbs: number; fiber: number;
  vitC: number; vitA: number; vitK: number; vitE: number;
  iron: number; calcium: number; potassium: number; magnesium: number; zinc: number;
  antioxidantMultiplier: number; // vs mature plant
  growDays: number;
  benefits: { uz: string; ru: string }[];
}> = {
  rukkola: {
    nameUz: 'Rukkola', nameRu: 'Руккола',
    calories: 25, protein: 2.6, fat: 0.7, carbs: 3.7, fiber: 1.6,
    vitC: 97, vitA: 2373, vitK: 108.6, vitE: 0.4,
    iron: 1.5, calcium: 160, potassium: 369, magnesium: 47, zinc: 0.5,
    antioxidantMultiplier: 8, growDays: 7,
    benefits: [
      { uz: "Jigar tozalashda yordam beradi", ru: "Помогает очищать печень" },
      { uz: "Immunitetni kuchaytiradi (Vitamin C)", ru: "Укрепляет иммунитет (Витамин C)" },
    ],
  },
  rediska: {
    nameUz: 'Rediska', nameRu: 'Редис',
    calories: 43, protein: 3.8, fat: 0.5, carbs: 3.4, fiber: 2.1,
    vitC: 38, vitA: 391, vitK: 28.9, vitE: 2.4,
    iron: 2.2, calcium: 51, potassium: 280, magnesium: 35, zinc: 0.6,
    antioxidantMultiplier: 6, growDays: 6,
    benefits: [
      { uz: "Ovqat hazm qilishni yaxshilaydi", ru: "Улучшает пищеварение" },
      { uz: "Antioksidantlarga boy", ru: "Богат антиоксидантами" },
    ],
  },
  kungaboqar: {
    nameUz: "Kungaboqar", nameRu: 'Подсолнечник',
    calories: 28, protein: 3.2, fat: 1.4, carbs: 2.2, fiber: 1.8,
    vitC: 9.7, vitA: 240, vitK: 78, vitE: 4.4,
    iron: 2.0, calcium: 35, potassium: 254, magnesium: 56, zinc: 1.3,
    antioxidantMultiplier: 5, growDays: 7,
    benefits: [
      { uz: "Vitamin E — teri salomatligi uchun", ru: "Витамин E — для здоровья кожи" },
      { uz: "Oqsilga boy — mushaklar uchun", ru: "Богат белком — для мышц" },
    ],
  },
  brokkoli: {
    nameUz: 'Brokkoli', nameRu: 'Брокколи',
    calories: 34, protein: 2.8, fat: 0.6, carbs: 6.6, fiber: 2.6,
    vitC: 89, vitA: 623, vitK: 101.6, vitE: 0.8,
    iron: 0.7, calcium: 47, potassium: 316, magnesium: 21, zinc: 0.4,
    antioxidantMultiplier: 40, growDays: 7,
    benefits: [
      { uz: "Sulforafan — saraton profilaktikasi", ru: "Сульфорафан — профилактика рака" },
      { uz: "40x ko'proq antioksidant (kattaga nisbatan)", ru: "В 40 раз больше антиоксидантов (чем взрослое растение)" },
    ],
  },
  nohat: {
    nameUz: "No'xat", nameRu: 'Горох',
    calories: 23, protein: 4.2, fat: 0.3, carbs: 3.1, fiber: 2.3,
    vitC: 12, vitA: 166, vitK: 24.8, vitE: 0.2,
    iron: 1.3, calcium: 25, potassium: 220, magnesium: 18, zinc: 0.5,
    antioxidantMultiplier: 7, growDays: 5,
    benefits: [
      { uz: "Eng ko'p oqsil — sportchilar uchun ideal", ru: "Максимум белка — идеально для спортсменов" },
      { uz: "Past kaloriya, ko'p tolalar", ru: "Мало калорий, много клетчатки" },
    ],
  },
  mosh: {
    nameUz: 'Mosh (mung)', nameRu: 'Маш',
    calories: 19, protein: 3.0, fat: 0.2, carbs: 2.7, fiber: 1.9,
    vitC: 13, vitA: 127, vitK: 33, vitE: 0.1,
    iron: 0.9, calcium: 13, potassium: 149, magnesium: 18, zinc: 0.4,
    antioxidantMultiplier: 5, growDays: 5,
    benefits: [
      { uz: "Detoks uchun ajoyib", ru: "Отлично для детокса" },
      { uz: "Qon shakari darajasini nazorat qiladi", ru: "Контролирует уровень сахара в крови" },
    ],
  },
  bazilika: {
    nameUz: 'Bazilika', nameRu: 'Базилик',
    calories: 22, protein: 3.2, fat: 0.6, carbs: 2.7, fiber: 1.6,
    vitC: 18, vitA: 5275, vitK: 414.8, vitE: 0.8,
    iron: 3.2, calcium: 177, potassium: 295, magnesium: 64, zinc: 0.8,
    antioxidantMultiplier: 10, growDays: 10,
    benefits: [
      { uz: "Yallig'lanishga qarshi xususiyatlar", ru: "Противовоспалительные свойства" },
      { uz: "Vitamin A va K — ko'z va suyaklar uchun", ru: "Витамины A и K — для глаз и костей" },
    ],
  },
  gorchitsa: {
    nameUz: 'Gorchitsa', nameRu: 'Горчица',
    calories: 26, protein: 2.9, fat: 0.4, carbs: 4.7, fiber: 2.0,
    vitC: 70, vitA: 3024, vitK: 278, vitE: 2.0,
    iron: 1.6, calcium: 115, potassium: 384, magnesium: 32, zinc: 0.3,
    antioxidantMultiplier: 12, growDays: 6,
    benefits: [
      { uz: "Metabolizmni tezlashtiradi", ru: "Ускоряет метаболизм" },
      { uz: "Vitamin C boy — shamollashga qarshi", ru: "Богат витамином C — против простуды" },
    ],
  },
};

// ==========================================
// RECIPE OF THE DAY DATABASE (30 recipes for monthly rotation)
// ==========================================
const RECIPES: {
  nameUz: string; nameRu: string;
  microgreens: string[];
  prepTime: number; servings: number;
  calories: number; protein: number;
  ingredientsUz: string[]; ingredientsRu: string[];
  stepsUz: string[]; stepsRu: string[];
  tipUz: string; tipRu: string;
  category: 'breakfast' | 'salad' | 'smoothie' | 'snack' | 'main';
}[] = [
  {
    nameUz: "Brokkoli mikroko'kat smoothie", nameRu: 'Смузи с микрозеленью брокколи',
    microgreens: ['brokkoli', 'kungaboqar'], prepTime: 5, servings: 1, calories: 180, protein: 8,
    ingredientsUz: ['Brokkoli mikroko\'kat — 30g', 'Kungaboqar mikroko\'kat — 15g', 'Banan — 1 dona', 'Yogurt — 150 ml', 'Asal — 1 choy qoshiq'],
    ingredientsRu: ['Микрозелень брокколи — 30г', 'Микрозелень подсолнечника — 15г', 'Банан — 1 шт', 'Йогурт — 150 мл', 'Мёд — 1 ч.л.'],
    stepsUz: ['Barcha ingredientlarni blenderga soling', '30 soniya yuqori tezlikda aralashtiring', 'Stakanga quying, ustiga kungaboqar qo\'ying'],
    stepsRu: ['Все ингредиенты положите в блендер', 'Взбивайте 30 секунд на высокой скорости', 'Перелейте в стакан, сверху положите подсолнечник'],
    tipUz: "Ertalab ich qoringa iste'mol qilsangiz, sulforafan 40x yaxshiroq so'riladi!", tipRu: 'Употребляйте утром натощак — сульфорафан усваивается в 40 раз лучше!',
    category: 'smoothie',
  },
  {
    nameUz: "Rukkola va tuxum tost", nameRu: 'Тост с рукколой и яйцом',
    microgreens: ['rukkola'], prepTime: 10, servings: 2, calories: 280, protein: 14,
    ingredientsUz: ['Non (tost) — 2 dona', 'Tuxum — 2 dona', 'Rukkola mikroko\'kat — 20g', 'Avokado — yarim', 'Tuz, qora murch'],
    ingredientsRu: ['Тост — 2 шт', 'Яйцо — 2 шт', 'Микрозелень рукколы — 20г', 'Авокадо — половина', 'Соль, чёрный перец'],
    stepsUz: ['Nonni tosterda qizartiring', 'Tuxumni qaynatib yoki qovurib pishiring', 'Avokadoni ezib non ustiga suring', 'Tuxumni ustiga qo\'ying, rukkola bilan bezang'],
    stepsRu: ['Поджарьте хлеб в тостере', 'Сварите или пожарьте яйцо', 'Разомните авокадо на тосте', 'Положите яйцо сверху, украсьте рукколой'],
    tipUz: "Rukkola vitaminlari issiqlikda yo'qoladi — faqat tayyor taomga qo'shing!", tipRu: 'Витамины рукколы разрушаются при нагреве — добавляйте только в готовое блюдо!',
    category: 'breakfast',
  },
  {
    nameUz: "Detoks salat (5 tur mikroko'kat)", nameRu: 'Детокс-салат (5 видов микрозелени)',
    microgreens: ['rukkola', 'rediska', 'mosh', 'gorchitsa', 'brokkoli'], prepTime: 8, servings: 2, calories: 120, protein: 6,
    ingredientsUz: ['Rukkola — 15g', 'Rediska — 15g', 'Mosh — 15g', 'Gorchitsa — 10g', 'Brokkoli — 10g', 'Zaytun moyi — 1 osh qoshiq', 'Limon sharbati — 1 osh qoshiq'],
    ingredientsRu: ['Руккола — 15г', 'Редис — 15г', 'Маш — 15г', 'Горчица — 10г', 'Брокколи — 10г', 'Оливковое масло — 1 ст.л.', 'Лимонный сок — 1 ст.л.'],
    stepsUz: ['Barcha mikroko\'katlarni yuvib quritiring', 'Katta laganga soling va aralang', 'Zaytun moyi va limon sharbatini seping', 'Tuz va murch qo\'shing'],
    stepsRu: ['Промойте и обсушите всю микрозелень', 'Выложите в большую миску и перемешайте', 'Полейте оливковым маслом и лимонным соком', 'Посолите и поперчите'],
    tipUz: "Har kuni 50g mikroko'kat iste'mol qilish organizmni to'liq vitaminlar bilan ta'minlaydi.", tipRu: 'Ежедневное употребление 50г микрозелени обеспечивает организм полным набором витаминов.',
    category: 'salad',
  },
  {
    nameUz: "Protein bowl — sportchilar uchun", nameRu: 'Протеин-боул для спортсменов',
    microgreens: ['nohat', 'kungaboqar'], prepTime: 12, servings: 1, calories: 350, protein: 22,
    ingredientsUz: ['No\'xat mikroko\'kat — 40g', 'Kungaboqar — 20g', 'Qaynatilgan guruch — 150g', 'Tovuq ko\'krak — 100g', 'Soya sousi — 1 osh qoshiq'],
    ingredientsRu: ['Микрозелень гороха — 40г', 'Подсолнечник — 20г', 'Варёный рис — 150г', 'Куриная грудка — 100г', 'Соевый соус — 1 ст.л.'],
    stepsUz: ['Guruchni qaynatib, sovuting', 'Tovuqni qizartiring va bo\'laklang', 'Idishga guruch, tovuq, mikroko\'katlarni chiroyli joylashtiring', 'Soya sousi seping'],
    stepsRu: ['Сварите рис и остудите', 'Обжарьте и нарежьте курицу', 'Красиво выложите рис, курицу и микрозелень', 'Полейте соевым соусом'],
    tipUz: "No'xat mikroko'kat 100g da 4.2g oqsil — eng yuqori ko'rsatkich!", tipRu: 'В 100г микрозелени гороха 4.2г белка — лучший показатель!',
    category: 'main',
  },
  {
    nameUz: "Gorchitsa va pishloq snack", nameRu: 'Снэк с горчицей и сыром',
    microgreens: ['gorchitsa', 'bazilika'], prepTime: 5, servings: 2, calories: 160, protein: 9,
    ingredientsUz: ['Gorchitsa mikroko\'kat — 20g', 'Bazilika mikroko\'kat — 10g', 'Qattiq pishloq — 50g', 'Kreker — 6 dona', 'Asal — 1 choy qoshiq'],
    ingredientsRu: ['Микрозелень горчицы — 20г', 'Микрозелень базилика — 10г', 'Твёрдый сыр — 50г', 'Крекеры — 6 шт', 'Мёд — 1 ч.л.'],
    stepsUz: ['Pishloqni yupqa bo\'laklang', 'Krekerlarga pishloq qo\'ying', 'Mikroko\'katlar bilan bezang', 'Asal tomchilating'],
    stepsRu: ['Нарежьте сыр тонкими ломтиками', 'Положите сыр на крекеры', 'Украсьте микрозеленью', 'Капните мёд'],
    tipUz: "Gorchitsa metabolizmni 25% tezlashtiradi!", tipRu: 'Горчица ускоряет метаболизм на 25%!',
    category: 'snack',
  },
  {
    nameUz: "Bazilika limonad", nameRu: 'Базиликовый лимонад',
    microgreens: ['bazilika'], prepTime: 7, servings: 4, calories: 45, protein: 1,
    ingredientsUz: ['Bazilika mikroko\'kat — 15g', 'Limon — 2 dona', 'Shakar — 3 osh qoshiq', 'Suv — 1 litr', 'Muz'],
    ingredientsRu: ['Микрозелень базилика — 15г', 'Лимон — 2 шт', 'Сахар — 3 ст.л.', 'Вода — 1 литр', 'Лёд'],
    stepsUz: ['Limon sharbatini siqib oling', 'Suvga shakar qo\'shib aralashtiring', 'Bazilika qo\'shing va 10 min dam bering', 'Muzli stakanlarga quying'],
    stepsRu: ['Выжмите сок лимонов', 'Добавьте сахар в воду и перемешайте', 'Добавьте базилик и настаивайте 10 мин', 'Разлейте по стаканам со льдом'],
    tipUz: "Bazilika yallig'lanishga qarshi eng kuchli o'simlik hisoblanadi.", tipRu: 'Базилик считается одним из сильнейших противовоспалительных растений.',
    category: 'smoothie',
  },
  {
    nameUz: "Rediska va qaymoq brusketta", nameRu: 'Брускетта с редисом и крем-чизом',
    microgreens: ['rediska', 'rukkola'], prepTime: 8, servings: 3, calories: 190, protein: 7,
    ingredientsUz: ['Rediska mikroko\'kat — 25g', 'Rukkola — 10g', 'Qaymoqli pishloq — 80g', 'Baget non — 6 bo\'lak', 'Zaytun moyi, tuz'],
    ingredientsRu: ['Микрозелень редиса — 25г', 'Руккола — 10г', 'Крем-сыр — 80г', 'Багет — 6 ломтиков', 'Оливковое масло, соль'],
    stepsUz: ['Bagetni qizartiring', 'Pishloqni suring', 'Rediska va rukkola qo\'ying', 'Zaytun moyi seping'],
    stepsRu: ['Подрумяньте багет', 'Намажьте крем-сыр', 'Выложите редис и рукколу', 'Полейте оливковым маслом'],
    tipUz: "Rediska mikroko'kat o'tkir ta'mi ishtahani ochadi va hazm qilishni yaxshilaydi.", tipRu: 'Острый вкус микрозелени редиса улучшает аппетит и пищеварение.',
    category: 'snack',
  },
];

// Micronutrient totals for a set of microgreens (≈20g of each in a serving).
function recipeNutrition(microgreens: string[]) {
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
function getDailyRecipe(dateStr?: string) {
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
function calculateNutrition(items: { crop: string; grams: number }[]) {
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

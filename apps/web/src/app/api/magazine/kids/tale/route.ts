import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// ════════════════════════════════════════════════════════════
// Нейро-сказка с именем ребёнка (детская механика).
// Публичный роут (kid-facing), как /api/ai/chat. Gemini REST + JSON.
// ════════════════════════════════════════════════════════════

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function clean(s: unknown, max: number): string {
  return String(s ?? '').replace(/[<>{}]/g, '').trim().slice(0, max);
}

const SYSTEM = `Ты — добрый сказочник журнала FRESH WEEKLY. Сочиняешь короткие добрые сказки для детей 4–8 лет на русском.
Главный герой — весёлый росточек микрозелени по имени Росточек, который дружит с ребёнком.
Сказка мягко учит любить овощи, зелень и здоровую еду, быть добрым и заботиться о растениях.
ПРАВИЛА: только доброе и безопасное содержание; без страха и насилия; 150–220 слов; 3–4 коротких абзаца;
обязательно используй имя ребёнка несколько раз. Верни ТОЛЬКО JSON: {"title": string, "story": string}.`;

async function callGemini(prompt: string): Promise<{ title: string; story: string }> {
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.95, maxOutputTokens: 1024, topP: 0.95, responseMimeType: 'application/json' },
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    });
    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const parsed = JSON.parse(text);
      return { title: String(parsed.title || 'Сказка про Росточка'), story: String(parsed.story || '') };
    }
    if (res.status === 429 && attempt < 2) { await new Promise((r) => setTimeout(r, (attempt + 1) * 2500)); continue; }
    throw new Error(`Gemini API error: ${res.status}`);
  }
  throw new Error('Gemini: max retries exceeded');
}

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const childName = clean(raw.childName, 30);
    const age = clean(raw.age, 3);
    const favorite = clean(raw.favorite, 40);
    if (!childName) return NextResponse.json({ error: 'Укажи имя ребёнка' }, { status: 400 });
    if (!GEMINI_API_KEY || GEMINI_API_KEY.length < 10) {
      return NextResponse.json({ error: 'Сказочник сейчас отдыхает — попробуйте позже' }, { status: 503 });
    }
    const prompt = [
      `Имя ребёнка: ${childName}.`,
      age ? `Возраст: ${age}.` : '',
      favorite ? `Что любит ребёнок: ${favorite} (впиши это в сказку).` : '',
      'Сочини добрую сказку про Росточка и этого ребёнка.',
    ].filter(Boolean).join('\n');

    const tale = await callGemini(prompt);
    return NextResponse.json({ ...tale, source: 'gemini' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Ошибка' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { generateJSON, aiProvider } from '@/lib/magazine/ai';

export const dynamic = 'force-dynamic';

// ════════════════════════════════════════════════════════════
// Нейро-сказка с именем ребёнка. Публичный роут (kid-facing).
// OpenAI-first, Gemini fallback (см. lib/magazine/ai.ts).
// ════════════════════════════════════════════════════════════

function clean(s: unknown, max: number): string {
  return String(s ?? '').replace(/[<>{}]/g, '').trim().slice(0, max);
}

const SYSTEM = `Ты — добрый сказочник журнала FRESH WEEKLY. Сочиняешь короткие добрые сказки для детей 4–8 лет на русском.
Главный герой — весёлый росточек микрозелени по имени Росточек, который дружит с ребёнком.
Сказка мягко учит любить овощи, зелень и здоровую еду, быть добрым и заботиться о растениях.
ПРАВИЛА: только доброе и безопасное содержание; без страха и насилия; 150–220 слов; 3–4 коротких абзаца;
обязательно используй имя ребёнка несколько раз. Верни ТОЛЬКО JSON: {"title": string, "story": string}.`;

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const childName = clean(raw.childName, 30);
    const age = clean(raw.age, 3);
    const favorite = clean(raw.favorite, 40);
    if (!childName) return NextResponse.json({ error: 'Укажи имя ребёнка' }, { status: 400 });
    if (!aiProvider()) {
      return NextResponse.json({ error: 'Сказочник сейчас отдыхает — попробуйте позже' }, { status: 503 });
    }
    const prompt = [
      `Имя ребёнка: ${childName}.`,
      age ? `Возраст: ${age}.` : '',
      favorite ? `Что любит ребёнок: ${favorite} (впиши это в сказку).` : '',
      'Сочини добрую сказку про Росточка и этого ребёнка. Верни JSON {"title","story"}.',
    ].filter(Boolean).join('\n');

    const parsed = await generateJSON(SYSTEM, prompt, { temperature: 0.95, maxTokens: 1024 });
    return NextResponse.json({
      title: String(parsed.title || 'Сказка про Росточка'),
      story: String(parsed.story || ''),
      source: aiProvider(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Ошибка' }, { status: 500 });
  }
}

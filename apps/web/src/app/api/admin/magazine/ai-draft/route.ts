import { NextResponse } from 'next/server';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { SECTION_TITLES, AUDIENCE_LABELS } from '@/lib/magazine/types';

export const dynamic = 'force-dynamic';

// ════════════════════════════════════════════════════════════
// Этап 2 — черновик слота от ИИ.
// Заполняет ТЕКСТОВЫЕ поля переданного блока свежим контентом (RU),
// сохраняя структуру/ключи. Владелец правит и утверждает.
// Тот же паттерн Gemini REST, что и в /api/ai/chat (с ретраем на 429).
// ════════════════════════════════════════════════════════════

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const PROTECTED = new Set(['id', 'type', 'audience', 'origin', 'mechanic']);

function systemPrompt(): string {
  return `Ты — главный редактор FRESH WEEKLY, премиального еженедельного журнала о еде, ресторанах и здоровье для гостей ресторанов Узбекистана (Ташкент, Самарканд).
Стиль: живой, экспертный, тёплый, как Bon Appétit × Monocle. Пиши на русском.
Факты правдоподобны и полезны; тон дружелюбный, без канцелярита. Всегда ненавязчиво связывай тему с микрозеленью/свежей зеленью, где это уместно.
Тебе дают JSON-блок журнала. Задача: переписать/заполнить ТОЛЬКО текстовые поля свежим контентом для секции.
ПРАВИЛА:
- Верни ТОЛЬКО валидный JSON — тот же объект с теми же ключами и той же структурой.
- НЕ меняй поля id, type, audience, origin, mechanic.
- Сохраняй типы: строки → строки, массивы объектов → массивы объектов с теми же ключами.
- Для массивов можно менять содержимое элементов; количество оставляй близким к исходному.
- Тексты краткие и ёмкие (формат A5).`;
}

function userPrompt(block: any, ctx: any): string {
  const section = SECTION_TITLES[block.type as keyof typeof SECTION_TITLES] || block.type;
  const audience = AUDIENCE_LABELS[block.audience as keyof typeof AUDIENCE_LABELS] || '';
  const lines = [
    `Секция: «${section}» (${audience}).`,
    ctx?.restaurantName ? `Ресторан: ${ctx.restaurantName}${ctx.city ? `, ${ctx.city}` : ''}.` : '',
    ctx?.menuItems?.length ? `Меню ресторана (контекст): ${ctx.menuItems.join(', ')}.` : '',
    ctx?.weekTheme ? `Тема выпуска недели: ${ctx.weekTheme}.` : '',
    '',
    'Заполни этот блок (верни тот же JSON с теми же ключами):',
    JSON.stringify(block, null, 2),
  ];
  return lines.filter(Boolean).join('\n');
}

async function callGeminiJSON(block: any, ctx: any): Promise<any> {
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: systemPrompt() }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt(block, ctx) }] }],
    generationConfig: {
      temperature: 0.85,
      maxOutputTokens: 2048,
      topP: 0.95,
      responseMimeType: 'application/json',
    },
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return JSON.parse(text);
    }
    if (res.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, (attempt + 1) * 2500));
      continue;
    }
    const err = await res.text();
    console.error(`Gemini ai-draft error (attempt ${attempt + 1}):`, err);
    throw new Error(`Gemini API error: ${res.status}`);
  }
  throw new Error('Gemini: max retries exceeded');
}

// Восстанавливаем защищённые поля из оригинала (id/type/audience/origin/mechanic)
function reconcile(original: any, generated: any): any {
  const result: any = { ...original };
  for (const [k, v] of Object.entries(generated || {})) {
    if (PROTECTED.has(k)) continue;
    result[k] = v;
  }
  return result;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const { block, context } = await request.json();
    if (!block || !block.type) {
      return NextResponse.json({ error: 'block is required' }, { status: 400 });
    }
    if (!GEMINI_API_KEY || GEMINI_API_KEY.length < 10) {
      return NextResponse.json({ error: 'GEMINI_API_KEY не настроен' }, { status: 503 });
    }
    const generated = await callGeminiJSON(block, context || {});
    const merged = reconcile(block, generated);
    return NextResponse.json({ block: merged, source: 'gemini' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'AI error' }, { status: 500 });
  }
}

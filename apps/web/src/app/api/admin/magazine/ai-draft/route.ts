import { NextResponse } from 'next/server';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { SECTION_TITLES, AUDIENCE_LABELS } from '@/lib/magazine/types';
import { generateJSON, aiProvider, type JsonRecord } from '@/lib/magazine/ai';

export const dynamic = 'force-dynamic';

// ════════════════════════════════════════════════════════════
// Черновик слота от ИИ (OpenAI-first, Gemini fallback — см. lib/magazine/ai.ts).
// Заполняет ТЕКСТОВЫЕ поля блока, сохраняя структуру/ключи.
// ════════════════════════════════════════════════════════════

const PROTECTED = new Set(['id', 'type', 'audience', 'origin', 'mechanic']);

function systemPrompt(): string {
  return `Ты — главный редактор FRESH WEEKLY, премиального еженедельного журнала о еде, ресторанах и здоровье для гостей ресторанов Узбекистана (Ташкент, Самарканд).
Стиль: живой, экспертный, тёплый, как Bon Appétit × Monocle.
Факты правдоподобны и полезны; тон дружелюбный, без канцелярита. Всегда ненавязчиво связывай тему с микрозеленью/свежей зеленью, где это уместно.
Тебе дают JSON-блок журнала. Задача: переписать/заполнить ТОЛЬКО текстовые поля свежим контентом для секции.

ЖУРНАЛ ТРЁХЪЯЗЫЧНЫЙ: каждый текст печатается сразу на русском, узбекском (латиница) и английском.
- Каждое ТЕКСТОВОЕ поле возвращай объектом: {"ru": "...", "uz": "...", "en": "..."} — все три языка обязательны.
- uz — узбекская латиница (o‘, g‘), естественный перевод, а не транслитерация.
- НЕ оборачивай в объект служебные поля: id, type, audience, origin, mechanic, botLink, arUrl, icon, rank, per100, vs,
  и любые поля-картинки (image, heroImage, background, portrait, farmImage, cardImage) — они остаются строками.

ПРАВИЛА:
- Верни ТОЛЬКО валидный JSON — тот же объект с теми же ключами и той же структурой.
- НЕ меняй поля id, type, audience, origin, mechanic.
- Массивы объектов → массивы объектов с теми же ключами; количество элементов оставляй близким к исходному.
- ОЧЕНЬ ВАЖНО: тексты КОРОТКИЕ (на A5 каждый текст идёт трижды). Заголовок ≤ 6 слов,
  описание пункта ≤ 20 слов, абзац ≤ 45 слов.`;
}

/** Контекст ресторана для подсказки — приходит из админки, все поля необязательны. */
interface DraftContext {
  restaurantName?: string;
  city?: string;
  menuItems?: string[];
  weekTheme?: string;
}

function userPrompt(block: JsonRecord, ctx: DraftContext): string {
  const section = SECTION_TITLES[block.type as keyof typeof SECTION_TITLES] || String(block.type);
  const audience = AUDIENCE_LABELS[block.audience as keyof typeof AUDIENCE_LABELS] || '';
  const lines = [
    `Секция: «${section}» (${audience}).`,
    ctx.restaurantName ? `Ресторан: ${ctx.restaurantName}${ctx.city ? `, ${ctx.city}` : ''}.` : '',
    ctx.menuItems?.length ? `Меню ресторана (контекст): ${ctx.menuItems.join(', ')}.` : '',
    ctx.weekTheme ? `Тема выпуска недели: ${ctx.weekTheme}.` : '',
    '',
    'Заполни этот блок (верни тот же JSON с теми же ключами):',
    JSON.stringify(block, null, 2),
  ];
  return lines.filter(Boolean).join('\n');
}

// Восстанавливаем защищённые поля из оригинала (id/type/audience/origin/mechanic)
function reconcile(original: JsonRecord, generated: JsonRecord): JsonRecord {
  const result: JsonRecord = { ...original };
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
    if (!aiProvider()) {
      return NextResponse.json({ error: 'AI не настроен (OPENAI_API_KEY или GEMINI_API_KEY)' }, { status: 503 });
    }
    const generated = await generateJSON(systemPrompt(), userPrompt(block, context || {}), { temperature: 0.85, maxTokens: 2048 });
    const merged = reconcile(block, generated);
    return NextResponse.json({ block: merged, source: aiProvider() });
  } catch (error: unknown) {
    console.error('[/api/admin/magazine/ai-draft] POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

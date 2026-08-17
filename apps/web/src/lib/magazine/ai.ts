// ════════════════════════════════════════════════════════════
// AI-помощник журнальных роутов. Поставщик один — OpenAI.
//
// Здесь был запасной Gemini, и это та же тихая подмена, что уже стоила
// ИИ-офису месяцев работы на слабой модели (packages/mg_ai/mg_ai/engine.py):
// отличить «сгенерировано основной моделью» от «сгенерировано запасной» было
// нельзя ни в ответе, ни в логе — а в журнал это уходит текстом для читателя.
// Нет ключа — честная ошибка, а не текст неизвестного качества.
//
// Все вызовы просят СТРОГО JSON. Один helper для ai-draft / нейро-сказки /
// брифинга.
// ════════════════════════════════════════════════════════════

import { OPENAI_MODEL, tokenLimitParams } from '../ai/models';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/** Есть ли чем генерировать. `null` — ключа нет, роут обязан сказать об этом. */
export function aiProvider(): 'openai' | null {
  return OPENAI_API_KEY && OPENAI_API_KEY.length > 10 ? 'openai' : null;
}

interface Opts { temperature?: number; maxTokens?: number }

/** Модель возвращает произвольный JSON-объект: ключи известны только вызывающему. */
export type JsonRecord = Record<string, unknown>;

async function openaiJSON(system: string, prompt: string, o: Opts): Promise<JsonRecord> {
  const body = JSON.stringify({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    temperature: o.temperature ?? 0.85,
    // Лимит токенов — по семейству модели (lib/ai/models.ts). Здесь стоял
    // жёсткий `max_tokens`, а рассуждающие модели его отвергают: генерация
    // журнала падала бы с «OpenAI API error: 400» на каждом вызове.
    ...tokenLimitParams(OPENAI_MODEL, o.maxTokens ?? 2048),
    response_format: { type: 'json_object' },
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body,
    });
    if (res.ok) {
      const data = await res.json();
      return JSON.parse(data.choices?.[0]?.message?.content || '{}');
    }
    if (res.status === 429 && attempt < 2) { await new Promise((r) => setTimeout(r, (attempt + 1) * 2500)); continue; }
    throw new Error(`OpenAI API error: ${res.status}`);
  }
  throw new Error('OpenAI: max retries exceeded');
}

/** Сгенерировать JSON-объект через OpenAI. Без ключа — отказ, не подмена. */
export async function generateJSON(system: string, prompt: string, opts: Opts = {}): Promise<JsonRecord> {
  if (!aiProvider()) throw new Error('AI не настроен: задайте OPENAI_API_KEY');
  return openaiJSON(system, prompt, opts);
}

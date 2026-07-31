// ════════════════════════════════════════════════════════════
// Переключаемый AI-провайдер для магазинных роутов.
// Приоритет: OpenAI (основной стек компании) → Gemini (fallback).
// Все вызовы просят СТРОГО JSON. Один helper для ai-draft / нейро-сказки / брифинга.
// ════════════════════════════════════════════════════════════

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

export function aiProvider(): 'openai' | 'gemini' | null {
  if (OPENAI_API_KEY && OPENAI_API_KEY.length > 10) return 'openai';
  if (GEMINI_API_KEY && GEMINI_API_KEY.length > 10) return 'gemini';
  return null;
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
    max_tokens: o.maxTokens ?? 2048,
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

async function geminiJSON(system: string, prompt: string, o: Opts): Promise<JsonRecord> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: o.temperature ?? 0.85, maxOutputTokens: o.maxTokens ?? 2048, responseMimeType: 'application/json' },
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${url}?key=${GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (res.ok) {
      const data = await res.json();
      return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
    }
    if (res.status === 429 && attempt < 2) { await new Promise((r) => setTimeout(r, (attempt + 1) * 2500)); continue; }
    throw new Error(`Gemini API error: ${res.status}`);
  }
  throw new Error('Gemini: max retries exceeded');
}

/** Сгенерировать JSON-объект. OpenAI приоритетно, Gemini — fallback. */
export async function generateJSON(system: string, prompt: string, opts: Opts = {}): Promise<JsonRecord> {
  const provider = aiProvider();
  if (provider === 'openai') return openaiJSON(system, prompt, opts);
  if (provider === 'gemini') return geminiJSON(system, prompt, opts);
  throw new Error('AI не настроен: задайте OPENAI_API_KEY (или GEMINI_API_KEY)');
}

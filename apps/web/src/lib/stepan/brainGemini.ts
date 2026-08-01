// Вынесено из brain.ts: файл перерос 200 строк.
// Цикл рассуждения (think) остался там же.

import { toolSchemas } from './tools';
import { GEMINI_API_KEY, GEMINI_MODEL, MAX_STEPS, SYSTEM_PROMPT, type ChatMessage, type BrainResult } from './brainConfig';
import { handleCall } from './brainCall';

/** Часть сообщения Gemini: текст, вызов функции или её результат. */
type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args?: Record<string, unknown> } }
  | { functionResponse: { name: string; response: { result: unknown } } };

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

/** Сужение: часть с вызовом функции. */
function isFunctionCall(p: GeminiPart): p is { functionCall: { name: string; args?: Record<string, unknown> } } {
  return 'functionCall' in p;
}

export async function runGemini(messages: ChatMessage[]): Promise<BrainResult> {
  const functionDeclarations = toolSchemas('web');
  const contents: GeminiContent[] = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const proposals: BrainResult['proposals'] = [];
  const usedTools: string[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          tools: [{ functionDeclarations }],
          generationConfig: { temperature: 0.2 },
        }),
      },
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Gemini ${res.status}: ${detail.slice(0, 200)}`);
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const fnCalls = (parts as GeminiPart[]).filter(isFunctionCall).map((p) => p.functionCall);

    if (!fnCalls.length) {
      const text = (parts as GeminiPart[]).map((p) => ('text' in p ? p.text : '')).filter(Boolean).join('\n');
      return { reply: text, proposals, usedTools };
    }

    contents.push({ role: 'model', parts });

    const responseParts: GeminiPart[] = [];
    for (const call of fnCalls) {
      usedTools.push(call.name);
      const output = await handleCall(call.name, call.args ?? {}, proposals);
      responseParts.push({
        functionResponse: { name: call.name, response: { result: output } },
      });
    }
    contents.push({ role: 'user', parts: responseParts });
  }

  return {
    reply: 'Не удалось закончить рассуждение за отведённые шаги. Уточните вопрос.',
    proposals,
    usedTools,
  };
}

// Вынесено из brain.ts: файл перерос 200 строк.
// Цикл рассуждения (think) остался там же.

import { toolSchemas } from './tools';
import { OPENAI_API_KEY, OPENAI_MODEL, MAX_STEPS, SYSTEM_PROMPT, type ChatMessage, type BrainResult } from './brainConfig';
import { handleCall } from './brainCall';

/** Сообщение в диалоге OpenAI: системное/пользовательское, ответ модели с
 *  вызовами инструментов, либо результат инструмента. */
type OpenAiMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string | null; tool_calls?: OpenAiToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

interface OpenAiToolCall {
  id: string;
  function?: { name: string; arguments?: string };
}

export async function runOpenAI(messages: ChatMessage[]): Promise<BrainResult> {
  const tools = toolSchemas('web').map(t => ({ type: 'function' as const, function: t }));
  const convo: OpenAiMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages.map(m => ({ role: m.role, content: m.content })),
  ];

  const proposals: BrainResult['proposals'] = [];
  const usedTools: string[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({ model: OPENAI_MODEL, messages: convo, tools, temperature: 0.2 }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`OpenAI ${res.status}: ${detail.slice(0, 200)}`);
    }

    const data = await res.json();
    const message = data.choices?.[0]?.message;
    if (!message) throw new Error('OpenAI вернул пустой ответ');

    const calls = message.tool_calls ?? [];
    if (!calls.length) {
      return { reply: message.content ?? '', proposals, usedTools };
    }

    convo.push(message);

    for (const call of calls) {
      const name = call.function?.name;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function?.arguments || '{}');
      } catch {
        // Модель иногда присылает битый JSON — сообщаем ей об этом.
      }
      usedTools.push(name);
      const output = await handleCall(name, args, proposals);
      convo.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(output) });
    }
  }

  return {
    reply: 'Не удалось закончить рассуждение за отведённые шаги. Уточните вопрос.',
    proposals,
    usedTools,
  };
}

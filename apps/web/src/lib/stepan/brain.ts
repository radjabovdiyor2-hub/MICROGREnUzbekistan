import { READ_BY_NAME, WRITE_BY_NAME, toolSchemas, TG_ONLY_NAMES } from './tools';
import { signProposal, type ProposalPayload } from './proposal';

// ══════════════════════════════════════════════════════════════════════
// Цикл рассуждения Стёпана.
//
// Инструменты чтения выполняются прямо здесь и возвращаются модели,
// чтобы она рассуждала на настоящих данных. Инструменты записи НЕ
// выполняются никогда: они превращаются в подписанные предложения,
// которые владелец подтверждает вручную.
//
// Провайдер тот же, что у роутов журнала: OpenAI приоритетно, Gemini —
// запасной (lib/magazine/ai.ts придерживается того же порядка).
// ══════════════════════════════════════════════════════════════════════

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

/** Больше двух-трёх шагов Стёпану не нужно, а стоимость растёт линейно. */
const MAX_STEPS = 6;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface BrainResult {
  reply: string;
  proposals: Array<ProposalPayload & { token: string }>;
  usedTools: string[];
}

export function aiAvailable(): boolean {
  return Boolean(
    (OPENAI_API_KEY && OPENAI_API_KEY.length > 10) ||
    (GEMINI_API_KEY && GEMINI_API_KEY.length > 10),
  );
}

const SYSTEM_PROMPT = `Ты — Стёпан, операционный директор компании Microgreen Uzbekistan (Самарканд).
Ты работаешь внутри админки: владелец спрашивает — ты отвечаешь по РЕАЛЬНЫМ данным.

Как работать:
1. Не угадывай цифры. Нужны данные — вызови инструмент чтения. Несколько сразу можно.
2. Отвечай кратко и по-деловому, на русском. Суммы — в сумах, с разделителями разрядов.
3. Если владелец просит что-то ИЗМЕНИТЬ — вызови соответствующий инструмент записи.
   Он НЕ выполнится сразу: владелец увидит карточку и подтвердит вручную. Это норма,
   так и задумано. Не обещай, что уже сделал — говори «подготовил, подтвердите».
4. Прежде чем менять цену товара, найди его через find_product и возьми оттуда id.
5. Заметил проблему в данных (критический остаток, просроченные задачи, упавший бот,
   перерасход бюджета ИИ) — скажи об этом, даже если не спрашивали.
6. Не знаешь или данных нет — так и скажи. Выдумывать факты о бизнесе нельзя.
7. Эти инструменты работают ТОЛЬКО в Telegram: ${TG_ONLY_NAMES.join(', ')}.
   Если владелец спросит — объясни, что они доступны в Telegram-версии Стёпана.`;

// ─────────────────────────── OpenAI ───────────────────────────

/** Сообщение в диалоге OpenAI: системное/пользовательское, ответ модели с
 *  вызовами инструментов, либо результат инструмента. */
type OpenAiMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string | null; tool_calls?: OpenAiToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

interface OpenAiToolCall {
  id: string;
  function?: { name: string; arguments?: string };
}

async function runOpenAI(messages: ChatMessage[]): Promise<BrainResult> {
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

// ─────────────────────────── Gemini ───────────────────────────

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

async function runGemini(messages: ChatMessage[]): Promise<BrainResult> {
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

// ─────────────────────── Общая обработка вызова ───────────────────────

async function handleCall(
  name: string,
  args: Record<string, unknown>,
  proposals: BrainResult['proposals'],
): Promise<unknown> {
  const readTool = READ_BY_NAME.get(name);
  if (readTool) {
    try {
      return await readTool.run(args);
    } catch (error) {
      console.error(`[stepan] инструмент ${name} упал:`, error);
      return { error: error instanceof Error ? error.message : 'ошибка выполнения' };
    }
  }

  const writeTool = WRITE_BY_NAME.get(name);
  if (writeTool) {
    // Ключевой момент: НЕ выполняем. Готовим предложение.
    try {
      const preview = await writeTool.preview(args);
      if (preview.error) return { error: preview.error };

      const payload: ProposalPayload = {
        tool: name,
        args,
        summary: preview.summary,
        before: preview.before,
        after: preview.after,
        risky: preview.risky,
      };
      const token = signProposal(payload);
      if (!token) {
        return { error: 'Подтверждение действий недоступно: не настроен SESSION_SECRET' };
      }

      proposals.push({ ...payload, token });
      return {
        status: 'awaiting_confirmation',
        note: 'Действие подготовлено и показано владельцу. Оно НЕ выполнено до подтверждения.',
        summary: preview.summary,
      };
    } catch (error) {
      console.error(`[stepan] подготовка ${name} упала:`, error);
      return { error: error instanceof Error ? error.message : 'ошибка подготовки' };
    }
  }

  return { error: `Неизвестный инструмент: ${name}` };
}

export async function think(messages: ChatMessage[]): Promise<BrainResult> {
  if (OPENAI_API_KEY && OPENAI_API_KEY.length > 10) return runOpenAI(messages);
  if (GEMINI_API_KEY && GEMINI_API_KEY.length > 10) return runGemini(messages);
  throw new Error('Не задан ни OPENAI_API_KEY, ни GEMINI_API_KEY');
}

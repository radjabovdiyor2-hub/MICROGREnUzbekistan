// Настройки и системный промпт Стёпана. Вынесено из brain.ts.

import { TG_ONLY_NAMES } from './tools';
import type { ProposalPayload } from './proposal';

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

/** Больше двух-трёх шагов Стёпану не нужно, а стоимость растёт линейно. */
export const MAX_STEPS = 6;

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

export const SYSTEM_PROMPT = `Ты — Стёпан, операционный директор компании Microgreen Uzbekistan (Самарканд).
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


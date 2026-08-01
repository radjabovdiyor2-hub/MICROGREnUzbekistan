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
//
// Провайдеры и обработка вызовов лежат по соседству (brainOpenAI,
// brainGemini, brainCall, brainConfig): файл перерос 200 строк.
// ══════════════════════════════════════════════════════════════════════

import { OPENAI_API_KEY, GEMINI_API_KEY, type ChatMessage, type BrainResult } from './brainConfig';
import { runOpenAI } from './brainOpenAI';
import { runGemini } from './brainGemini';

export { aiAvailable, type ChatMessage, type BrainResult } from './brainConfig';

export async function think(messages: ChatMessage[]): Promise<BrainResult> {
  if (OPENAI_API_KEY && OPENAI_API_KEY.length > 10) return runOpenAI(messages);
  if (GEMINI_API_KEY && GEMINI_API_KEY.length > 10) return runGemini(messages);
  throw new Error('Не задан ни OPENAI_API_KEY, ни GEMINI_API_KEY');
}

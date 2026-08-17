import { prisma } from '@repo/database';

/**
 * Учёт расхода на ИИ для витрины.
 *
 * До этого модуля в `apps/web` не было ни одной записи в `ai_usage`: клиент
 * OpenAI выбрасывал `data.usage`, а раздел «Расходы на ИИ» в админке читал
 * только то, что писал офис. Два канала расхода из трёх были невидимы —
 * при этом платит за них один и тот же ключ.
 *
 * Цены — те же, что в `packages/mg_ai` (TOKEN_COSTS), долларов за 1M токенов.
 * Модели, которой нет в таблице, считаем по gpt-4o-mini: занизить расход
 * хуже, чем ошибиться в большую сторону, поэтому берём не ноль.
 */
const TOKEN_COSTS: Record<string, { input: number; output: number }> = {
  // Актуальное семейство OpenAI (август 2026). Sol — флагман, Terra — баланс,
  // Luna — для дешёвых массовых задач. Держать в согласии с TOKEN_COSTS в
  // packages/mg_ai/mg_ai/engine.py: расход считается в двух рантаймах, а
  // раздел «Расходы на ИИ» в админке у них один.
  'gpt-5.6-sol': { input: 5, output: 30 },
  'gpt-5.6-terra': { input: 2, output: 12 },
  'gpt-5.6-luna': { input: 0.2, output: 1.2 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-5': { input: 1.25, output: 10 },
  'gpt-5-mini': { input: 0.25, output: 2 },
  'whisper-1': { input: 0, output: 0 },
  'tts-1': { input: 0, output: 0 },
};

const DEFAULT_COST = TOKEN_COSTS['gpt-4o-mini'];

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = TOKEN_COSTS[model] ?? DEFAULT_COST;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

export interface AiUsageRecord {
  /** Кто потратил: `storefront_web`, `storefront_bot`, имя офисного бота. */
  bot: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  provider?: string;
}

/**
 * Записать расход. Никогда не роняет вызывающий код: учёт важен, но ответ
 * клиенту важнее — как и `persist_fn` в офисе, это best-effort.
 */
export async function recordAiUsage(usage: AiUsageRecord): Promise<void> {
  try {
    const inputTokens = Math.max(0, Math.round(usage.inputTokens || 0));
    const outputTokens = Math.max(0, Math.round(usage.outputTokens || 0));
    if (inputTokens === 0 && outputTokens === 0) return;

    await prisma.aiUsage.create({
      data: {
        bot: usage.bot,
        // Поставщик один. Колонка осталась ради истории: по ней видно
        // расход тех месяцев, когда часть запросов молча уходила в Gemini.
        provider: usage.provider ?? 'openai',
        model: usage.model,
        inputTokens,
        outputTokens,
        costUsd: estimateCostUsd(usage.model, inputTokens, outputTokens),
      },
    });
  } catch (error) {
    console.error('AI usage record failed:', error);
  }
}

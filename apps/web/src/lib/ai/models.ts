/**
 * Модель OpenAI для витрины — ОДИН источник на весь apps/web.
 *
 * Имя модели было вписано в четыре файла (`openaiClient.ts`, `magazine/ai.ts`,
 * `stepan/brainConfig.ts`, плюс `docker-compose.prod.yml`), и они разошлись:
 * одни говорили `gpt-4o`, другие `gpt-4o-mini`, конфиг офиса — третье, а одна
 * из моделей аккаунту вообще не принадлежала. Неверное имя означает 400 от
 * OpenAI на каждый запрос, то есть ИИ витрины не работает.
 *
 * Здесь же живёт различие рассуждающих моделей: они принимают
 * `max_completion_tokens` и ОТВЕРГАЮТ `max_tokens`. Без этой развилки простая
 * смена `OPENAI_MODEL` ломает и чат, и генерацию журнала — с ошибкой, по
 * которой причину не угадать.
 *
 * Питоновский близнец: `packages/mg_ai/mg_ai/engine.py::_is_reasoning_model`.
 * Общего кода у TypeScript и Python здесь нет — только общее правило.
 */

/** Флагман OpenAI: reasoning_effort до `max`, окно 1,05 млн токенов. */
export const DEFAULT_OPENAI_MODEL = 'gpt-5.6-sol';

export const OPENAI_MODEL = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;

export function isReasoningModel(model: string): boolean {
  const m = model.toLowerCase();
  return m.startsWith('gpt-5') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4');
}

/**
 * Параметры лимита токенов для запроса — правильные для этой модели.
 *
 * `effort` управляет глубиной размышления (none | low | medium | high | xhigh |
 * max). У клиентских ответов он низкий намеренно: платит владелец, а покупателю
 * нужен быстрый ответ, а не рассуждение.
 */
export function tokenLimitParams(
  model: string,
  maxTokens: number,
  effort: 'none' | 'low' | 'medium' | 'high' = 'low',
): Record<string, unknown> {
  if (isReasoningModel(model)) {
    // Рассуждение тратит те же токены, что и ответ: без запаса ответ
    // обрывается на середине размышления и приходит пустым.
    return { max_completion_tokens: Math.max(maxTokens + 1500, 2000), reasoning_effort: effort };
  }
  return { max_tokens: maxTokens, top_p: 0.95 };
}

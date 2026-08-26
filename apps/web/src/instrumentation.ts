// ══════════════════════════════════════════════════════════════════════
// Наблюдаемость сервера: инициализация Sentry и приём ошибок запросов.
//
// ЧТО БЫЛО. В проекте лежали `sentry.client.config.ts` и
// `sentry.server.config.ts`, а `next.config.ts` подключал `withSentryConfig`
// при заданном DSN. Выглядело подключённым — и не работало: файлы
// `sentry.*.config.ts` относятся к СТАРОМУ соглашению, а этот Next грузит
// `instrumentation.ts` (сервер) и `instrumentation-client.ts` (браузер).
// То есть `Sentry.init` не вызывался никогда, и даже с настроенным DSN
// ошибки прода никуда не уходили.
//
// БЕЗ DSN НИЧЕГО НЕ ПРОИСХОДИТ, и это намеренно: на локальной машине и в
// тестах наблюдаемость не нужна, а падать из-за отсутствующей переменной
// окружения тем более. Импорт динамический — пакет живёт в
// devDependencies, и в прод-образе его может не оказаться.
// ══════════════════════════════════════════════════════════════════════

export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  try {
    const Sentry = await import('@sentry/nextjs');
    Sentry.init({
      dsn,
      // 10 % трасс в проде: полная выборка на витрине с ботами и кроном
      // означает счёт за наблюдение сопоставимый со счётом за хостинг.
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      enabled: process.env.NODE_ENV === 'production',
    });
  } catch (error) {
    // Пакета нет — сайт обязан работать. Молчать нельзя: иначе «ошибок
    // нет» будет означать «их некому ловить».
    console.warn('[instrumentation] Sentry не поднят:', error);
  }
}

/**
 * Ошибка запроса — в Sentry.
 *
 * Next зовёт это на каждую необработанную ошибку сервера, включая ошибки
 * рендера серверных компонентов. Без этого крючка в Sentry попадали бы
 * только те исключения, которые кто-то догадался отправить руками.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string | undefined> },
) {
  if (!process.env.SENTRY_DSN) return;

  try {
    const Sentry = await import('@sentry/nextjs');
    Sentry.captureException(error, {
      tags: { path: request.path, method: request.method },
    });
  } catch {
    // Отправить не смогли — исходная ошибка уже в логах Next.
  }
}

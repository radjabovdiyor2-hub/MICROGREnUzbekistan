// ══════════════════════════════════════════════════════════════════════
// Наблюдаемость браузера.
//
// Пара к `instrumentation.ts`: там сервер, здесь клиент. Файл
// `sentry.client.config.ts` этим Next не грузится вовсе — см. объяснение
// в серверном файле.
//
// Ключ здесь ПУБЛИЧНЫЙ (`NEXT_PUBLIC_SENTRY_DSN`) и другой, чем на
// сервере: серверный DSN в бандл попадать не должен. Не задан — модуль
// ничего не делает и ничего не грузит.
// ══════════════════════════════════════════════════════════════════════

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  import('@sentry/nextjs')
    .then((Sentry) => {
      Sentry.init({
        dsn,
        tracesSampleRate: 0.1,
        enabled: process.env.NODE_ENV === 'production',
      });
    })
    .catch((error) => {
      console.warn('[instrumentation-client] Sentry не поднят:', error);
    });
}

// Безопасная обработка ошибок для API-ответов.
//
// В production error.message может содержать имена таблиц, полей, SQL —
// всё, что Prisma и Node выбрасывают в stack. Отдавать это клиенту —
// раскрывать внутреннюю структуру атакующему.

const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Возвращает безопасное для клиента сообщение об ошибке.
 * В production — generic, в dev — полный message для отладки.
 */
export function safeError(error: unknown): string {
  if (!IS_PROD && error instanceof Error) return error.message;
  return 'Internal server error';
}

/**
 * Текст ошибки для показа пользователю в браузере.
 *
 * Отличие от safeError: здесь ошибка уже своя, клиентская (сеть, разбор
 * ответа, брошенный компонентом Error) — внутренностей сервера в ней нет,
 * поэтому текст показывать можно. Нужна ровно затем, чтобы `catch (e: unknown)`
 * не приходилось разворачивать в четыре строки проверок в каждом компоненте.
 */
export function clientErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Код ошибки Prisma (P2002 и т.п.) — или null, если это не она. */
export function prismaErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

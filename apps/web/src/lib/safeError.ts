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

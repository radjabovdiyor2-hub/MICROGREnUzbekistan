import { NextResponse } from 'next/server';
import type { z } from 'zod';

// ══════════════════════════════════════════════════════════════════════
// Разбор тела запроса по схеме — одинаково во всех роутах.
//
// ЧТО БЫЛО. `zod` стоит в зависимостях и используется в четырёх файлах из
// ста девятнадцати. Остальные роуты разбирают тело руками:
// `String(body.x || '').trim()`, `parseInt(...)`, `Number.isFinite(...)` —
// и каждый по-своему. Проверки при этом расходятся с типами TypeScript:
// тип говорит `amount: number`, а в базу уходит `NaN`, потому что пришла
// строка «двадцать тысяч».
//
// Особенно дорого это в денежных роутах: отрицательная сумма, ноль вместо
// суммы и `NaN` выглядят одинаково — как проводка, которую никто не
// заметил, пока не сошёлся отчёт.
//
// ЧТО ДАЁТ ЭТОТ ПОМОЩНИК. Одну форму ответа на кривое тело (400 с внятным
// текстом, а не 500 из глубины Prisma) и одно место, где решается, что
// считать ошибкой разбора. Схемы остаются у роутов: они про предметную
// область, а не про транспорт.
// ══════════════════════════════════════════════════════════════════════

export type Parsed<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

/** Первая понятная человеку ошибка из отчёта zod. */
function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'неверное тело запроса';
  const where = issue.path.length ? `${issue.path.join('.')}: ` : '';
  return `${where}${issue.message}`;
}

/**
 * Прочитать и проверить тело запроса.
 *
 * Возвращает либо данные с типом схемы, либо готовый ответ 400 — вызывающий
 * обязан его вернуть. Форма «либо-либо» выбрана нарочно: если бы помощник
 * бросал исключение, забытый `try` превращал бы кривое тело в 500, а
 * возвращённый `null` — в тихую работу с пустым объектом.
 */
export async function parseBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<Parsed<z.infer<S>>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Тело запроса не является JSON' }, { status: 400 }),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      response: NextResponse.json({ error: firstIssue(result.error) }, { status: 400 }),
    };
  }

  return { ok: true, data: result.data };
}

// ══════════════════════════════════════════════════════════════════════
// Контракты инструментов Стёпана. Вынесено из tools.ts.
//
// Это мастер-каталог для ОБОИХ рантаймов: админки (web) и Telegram (tg).
// Каждый инструмент объявляет `runtimes` — в каких средах он работает.
// Telegram-бот получает каталог через GET /api/admin/stepan/tools
// и исполняет web-инструменты через POST /api/admin/stepan/tools/execute.
//
// Разделение чтения и записи принципиальное:
//
//   ЧТЕНИЕ  — выполняется сразу, в цикле рассуждения. Ошибиться нельзя:
//             ничего не меняется.
//   ЗАПИСЬ  — в веб-рантайме НЕ выполняется: готовится предложение,
//             которое владелец подтверждает вручную. В Telegram подтверждение
//             происходит в диалоге, и execute вызывается через удалённый
//             эндпоинт /api/admin/stepan/tools/execute.
// ══════════════════════════════════════════════════════════════════════

/** Где инструмент доступен: web = админка, tg = Telegram-бот. */
export type ToolRuntime = 'web' | 'tg';

export interface ToolParam {
  type: 'string' | 'number' | 'boolean';
  description: string;
  enum?: string[];
}

/** Массив разрешён внутри params, но только для Telegram-стиля (register_sale.items). */
export interface ArrayToolParam {
  type: 'array';
  description: string;
  items: { type: 'object'; properties: Record<string, ToolParam>; required?: string[] };
}

export interface ReadTool {
  name: string;
  description: string;
  params: Record<string, ToolParam | ArrayToolParam>;
  required?: string[];
  runtimes: ToolRuntime[];
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface WriteTool {
  name: string;
  description: string;
  params: Record<string, ToolParam | ArrayToolParam>;
  required?: string[];
  runtimes: ToolRuntime[];
  /** Человеческое описание намерения + «было → стало» для карточки. */
  preview: (args: Record<string, unknown>) => Promise<{
    summary: string;
    before?: string;
    after?: string;
    /** true — действие видно клиентам сразу (рассылка, цена на витрине). */
    risky?: boolean;
    error?: string;
  }>;
  execute: (args: Record<string, unknown>) => Promise<{ ok: boolean; message: string }>;
}

/** Формат суммы для человекочитаемых сводок. */
export const money = (n: number) => `${Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ')} сум`;


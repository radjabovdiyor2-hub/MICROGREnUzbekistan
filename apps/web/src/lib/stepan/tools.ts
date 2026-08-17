import { READ_TOOLS_SUMMARY } from './readTools';
import { READ_TOOLS_CATALOG } from './readToolsCatalog';
import { WRITE_TOOLS_CORE } from './writeTools';
import { WRITE_TOOLS_OPS } from './writeToolsOps';
import { TG_READ_TOOLS, TG_WRITE_TOOLS } from './tgTools';
import { buildParamSchema, buildToolSchema } from './toolSchema';
import type { ReadTool, WriteTool, ToolRuntime } from './toolTypes';

// ══════════════════════════════════════════════════════════════════════
// Единый реестр инструментов Стёпана.
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
//
// Сами определения лежат по соседству (readTools, writeTools, tgTools и др.):
// реестр перерос 200 строк. Здесь остаётся сборка — карты имён и схемы.
// ══════════════════════════════════════════════════════════════════════

export type { ToolRuntime, ToolParam, ArrayToolParam, ReadTool, WriteTool } from './toolTypes';

export const READ_TOOLS: ReadTool[] = [...READ_TOOLS_SUMMARY, ...READ_TOOLS_CATALOG];
export const WRITE_TOOLS: WriteTool[] = [...WRITE_TOOLS_CORE, ...WRITE_TOOLS_OPS];

// ──────────────────── ОБЪЕДИНЁННЫЕ РЕЕСТРЫ ─────────────────────────────

const ALL_READ = [...READ_TOOLS, ...TG_READ_TOOLS];
const ALL_WRITE = [...WRITE_TOOLS, ...TG_WRITE_TOOLS];

export const READ_BY_NAME = new Map(ALL_READ.map(t => [t.name, t]));
export const WRITE_BY_NAME = new Map(ALL_WRITE.map(t => [t.name, t]));

/** Список Telegram-only инструментов — для честного отказа в промпте. */
export const TG_ONLY_NAMES = ALL_READ.filter(t => !t.runtimes.includes('web')).map(t => t.name);

/**
 * Описание инструментов в формате JSON Schema — для OpenAI.
 * Без аргумента возвращает все; с runtime — только те, что доступны.
 */
export function toolSchemas(runtime?: ToolRuntime) {
  const filter = (t: ReadTool | WriteTool) => !runtime || t.runtimes.includes(runtime);
  return [...ALL_READ.filter(filter).map(buildToolSchema), ...ALL_WRITE.filter(filter).map(buildToolSchema)];
}

/** Полный каталог для GET /api/admin/stepan/tools — определения без функций. */
export function registryPayload() {
  const entry = (t: ReadTool | WriteTool, kind: 'read' | 'write') => ({
    name: t.name,
    description: t.description,
    parameters: {
      type: 'object' as const,
      properties: Object.fromEntries(
        Object.entries(t.params).map(([k, p]) => [k, buildParamSchema(p)]),
      ),
      required: t.required ?? [],
    },
    runtimes: t.runtimes,
    kind,
    risky: kind === 'write' ? true : false,
  });
  return [
    ...ALL_READ.map(t => entry(t, 'read')),
    ...ALL_WRITE.map(t => entry(t, 'write')),
  ];
}

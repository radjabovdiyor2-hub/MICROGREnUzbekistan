// Вынесено из tools.ts: сборка описаний в формате JSON Schema для OpenAI.

import type { ToolParam, ArrayToolParam, ReadTool, WriteTool } from './toolTypes';

export function buildParamSchema(p: ToolParam | ArrayToolParam): Record<string, unknown> {
  if (p.type === 'array') {
    const ap = p as ArrayToolParam;
    return {
      type: 'array',
      description: ap.description,
      items: {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(ap.items.properties).map(([k, v]) => [k, buildParamSchema(v)]),
        ),
        required: ap.items.required ?? [],
      },
    };
  }
  return {
    type: p.type,
    description: p.description,
    ...(p.enum ? { enum: p.enum } : {}),
  };
}

export function buildToolSchema(t: ReadTool | WriteTool) {
  return {
    name: t.name,
    description: t.description,
    parameters: {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(t.params).map(([k, p]) => [k, buildParamSchema(p)]),
      ),
      required: t.required ?? [],
    },
  };
}

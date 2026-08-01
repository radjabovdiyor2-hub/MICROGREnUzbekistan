// Обработка вызова инструмента: чтение выполняется, запись превращается
// в подписанное предложение. Вынесено из brain.ts.

import { READ_BY_NAME, WRITE_BY_NAME } from './tools';
import { signProposal, type ProposalPayload } from './proposal';
import type { BrainResult } from './brainConfig';

export async function handleCall(
  name: string,
  args: Record<string, unknown>,
  proposals: BrainResult['proposals'],
): Promise<unknown> {
  const readTool = READ_BY_NAME.get(name);
  if (readTool) {
    try {
      return await readTool.run(args);
    } catch (error) {
      console.error(`[stepan] инструмент ${name} упал:`, error);
      return { error: error instanceof Error ? error.message : 'ошибка выполнения' };
    }
  }

  const writeTool = WRITE_BY_NAME.get(name);
  if (writeTool) {
    // Ключевой момент: НЕ выполняем. Готовим предложение.
    try {
      const preview = await writeTool.preview(args);
      if (preview.error) return { error: preview.error };

      const payload: ProposalPayload = {
        tool: name,
        args,
        summary: preview.summary,
        before: preview.before,
        after: preview.after,
        risky: preview.risky,
      };
      const token = signProposal(payload);
      if (!token) {
        return { error: 'Подтверждение действий недоступно: не настроен SESSION_SECRET' };
      }

      proposals.push({ ...payload, token });
      return {
        status: 'awaiting_confirmation',
        note: 'Действие подготовлено и показано владельцу. Оно НЕ выполнено до подтверждения.',
        summary: preview.summary,
      };
    } catch (error) {
      console.error(`[stepan] подготовка ${name} упала:`, error);
      return { error: error instanceof Error ? error.message : 'ошибка подготовки' };
    }
  }

  return { error: `Неизвестный инструмент: ${name}` };
}

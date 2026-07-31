import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';
import { READ_BY_NAME, WRITE_BY_NAME } from '@/lib/stepan/tools';
import { signProposal, type ProposalPayload } from '@/lib/stepan/proposal';

// ══════════════════════════════════════════════════════════════════════
// Удалённое исполнение инструмента Стёпана.
//
// Telegram-бот вызывает этот эндпоинт, когда модель в диалоге решает
// использовать инструмент, реализованный на стороне витрины (Prisma).
//
// ЧИТАЮЩИЕ инструменты исполняются здесь — они ничего не меняют.
//
// ИЗМЕНЯЮЩИЕ — здесь не исполняются никогда. Вместо этого возвращается
// подписанное предложение (status: confirm), бот показывает карточку
// «было → стало» с кнопками, и только нажатие владельца отправляет токен
// в /admin/stepan/execute. Главное правило системы: действие, меняющее данные,
// никогда не выполняется само. В админке оно соблюдается подписанными
// предложениями (/admin/stepan/execute + lib/stepan/proposal.ts): модель
// показывает карточку «было → стало», и до нажатия «Выполнить» в базе
// ничего не происходит.
//
// Первая версия этого роута вызывала writeTool.execute() напрямую, а в
// комментарии говорилось, что подтверждение произойдёт на стороне бота.
// В боте его не было: assistant.py шёл прямо в исполнение. Фраза в
// Telegram «подними цену на микс» меняла цену в живом каталоге сразу.
//
// Тот же самый механизм подписи, что и в админке (lib/stepan/proposal.ts):
// выполняется ровно то, что было предъявлено, и не позже чем через 15 минут.
//
// Авторизация: x-bot-secret — тот же, что для /admin/stepan/memory.
// Секрет общий для 14 контейнеров офиса, то есть поверхность шире, чем у
// админ-сессии. Ещё одна причина не пускать сюда запись.
// ══════════════════════════════════════════════════════════════════════

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  let body: { tool?: unknown; params?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: 'error', error: 'Некорректный JSON' }, { status: 400 });
  }

  const toolName = typeof body.tool === 'string' ? body.tool.trim() : '';
  if (!toolName) {
    return NextResponse.json({ status: 'error', error: 'Поле tool обязательно' }, { status: 400 });
  }

  const params = (body.params && typeof body.params === 'object' ? body.params : {}) as Record<string, unknown>;

  // Изменяющие инструменты проверяем ПЕРВЫМИ: здесь они не выполняются
  // никогда — только превращаются в подписанное предложение. Выполнит его
  // /admin/stepan/execute после того, как владелец нажмёт «Выполнить».
  const writeTool = WRITE_BY_NAME.get(toolName);
  if (writeTool) {
    try {
      const preview = await writeTool.preview(params);
      if (preview.error) {
        return NextResponse.json({ status: 'error', error: preview.error }, { status: 400 });
      }

      const payload: ProposalPayload = {
        tool: toolName,
        args: params,
        summary: preview.summary,
        before: preview.before,
        after: preview.after,
        risky: preview.risky,
      };
      const token = signProposal(payload);
      if (!token) {
        return NextResponse.json(
          { status: 'error', error: 'Подтверждение недоступно: не настроен SESSION_SECRET' },
          { status: 503 },
        );
      }

      audit({
        action: 'stepan.tool.proposed',
        actor: 'bot',
        role: 'ADMIN',
        target: toolName,
        meta: { summary: preview.summary },
      });

      // status: confirm — сигнал вызывающему рантайму показать карточку и
      // спросить владельца. Не ok и не error: ничего ещё не произошло.
      return NextResponse.json({ status: 'confirm', proposal: { ...payload, token } });
    } catch (error) {
      console.error(`[stepan/tools/execute] preview ${toolName} упал:`, error);
      return NextResponse.json(
        { status: 'error', error: error instanceof Error ? error.message : 'Ошибка подготовки' },
        { status: 500 },
      );
    }
  }

  const readTool = READ_BY_NAME.get(toolName);
  if (readTool) {
    try {
      const result = await readTool.run(params);
      return NextResponse.json({ status: 'ok', result });
    } catch (error) {
      console.error(`[stepan/tools/execute] read ${toolName} упал:`, error);
      return NextResponse.json(
        { status: 'error', error: error instanceof Error ? error.message : 'Ошибка выполнения' },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    { status: 'error', error: `Неизвестный инструмент: ${toolName}` },
    { status: 404 },
  );
}

import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';
import { READ_BY_NAME, WRITE_BY_NAME } from '@/lib/stepan/tools';

// ══════════════════════════════════════════════════════════════════════
// Удалённое исполнение инструмента Стёпана.
//
// Telegram-бот вызывает этот эндпоинт, когда модель в диалоге решает
// использовать инструмент, реализованный на стороне витрины (Prisma).
//
// ЧИТАЮЩИЕ инструменты исполняются здесь — они ничего не меняют.
//
// ИЗМЕНЯЮЩИЕ — НЕ исполняются. Здесь стоит 403, и это не временная мера
// осторожности, а главное правило системы: действие, меняющее данные,
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
// Чтобы включить изменяющие инструменты в Telegram, нужен там такой же
// путь с подтверждением: подписанный токен предложения + inline-кнопки
// aiogram. Пока его нет — 403.
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

  // Изменяющие инструменты проверяем ПЕРВЫМИ: отказ должен быть отказом
  // независимо от того, что окажется в реестре чтения потом.
  if (WRITE_BY_NAME.has(toolName)) {
    audit({
      action: 'stepan.tool.write_denied',
      actor: 'bot',
      role: 'ADMIN',
      target: toolName,
      meta: { params },
    });
    return NextResponse.json(
      {
        status: 'error',
        error:
          `Инструмент «${toolName}» меняет данные, а из Telegram это делается только ` +
          `с подтверждением. Откройте админку — Стёпан покажет карточку «было → стало» ` +
          `и выполнит после вашего нажатия.`,
      },
      { status: 403 },
    );
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

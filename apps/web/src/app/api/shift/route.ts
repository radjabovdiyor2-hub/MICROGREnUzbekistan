import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/adminAuth';
import { requireBotAuth } from '@/lib/botAuth';
import { publish } from '@/lib/realtime/bus';
import { safeError } from '@/lib/safeError';
import { announceShiftClose, announceShiftOpen } from '@/lib/shift/announce';
import { closeShift, currentShift, isShiftSource, openShift } from '@/lib/shift/store';
import {
  resolveEmployee,
  type EmployeeRef,
  type ResolvedEmployee,
} from '@/lib/tracking/fieldDay';

// ══════════════════════════════════════════════════════════════════════
// Своя смена: открыть, закрыть, узнать состояние.
//
// ЭТО ДВЕРЬ СОТРУДНИКА, А НЕ ВЛАДЕЛЬЦА. Соседняя `/api/admin/shifts`
// закрыта `isAuthorized` — владелец или ботовый секрет; заполняет её
// график смен. Отметить начало и конец СВОЕЙ смены человек не мог нигде:
// ни в приложении, ни в боте.
//
// ДВЕ ДОРОГИ ВНУТРЬ, как у крошек трека:
//   · сессия сотрудника — из приложения и из веба;
//   · ботовый секрет плюс `telegramId` в теле — из Telegram.
// Кто это, берём из подписи, а не из тела: телу здесь верить нельзя ровно
// по той же причине, по которой расстояние до клиента считает сервер.
//
// GET  — открыта ли смена и с какого времени.
// POST { action: 'open' | 'close', via?, telegramId? }
// ══════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic';

/** Кто обращается. `null` — никто: ни сессии, ни секрета. */
async function actor(
  request: NextRequest,
  body: Record<string, unknown> | null,
): Promise<ResolvedEmployee | { error: string; status: number }> {
  const session = getSession(request);
  let ref: EmployeeRef | null = null;

  if (session && (session.role === 'ADMIN' || session.role === 'SELLER') && session.name) {
    ref = { name: session.name };
  } else if (requireBotAuth(request)) {
    // `telegramId` приходит строкой намеренно: JSON теряет точность на
    // больших id.
    //
    // ИЩЕМ И В ТЕЛЕ, И В АДРЕСЕ. У запроса состояния (`GET`) тела нет
    // вовсе, и бот передаёт номер параметром. Первая версия читала только
    // тело — и бот не мог узнать, открыта ли смена: дверь отвечала «не
    // указан telegramId» на совершенно правильный запрос. Нашлось живой
    // проверкой, не тестом.
    const raw = body?.telegramId ?? request.nextUrl.searchParams.get('telegramId');
    const asText = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '';
    if (!/^\d{1,19}$/.test(asText)) return { error: 'Не указан telegramId', status: 400 };
    ref = { telegramId: BigInt(asText) };
  }

  // Словами, а не «Unauthorized»: это сообщение видит человек в поле, и
  // оно должно говорить, ЧТО ДЕЛАТЬ. Живая проверка показала английское
  // слово рядом с кнопкой — для продавца это просто «не работает».
  if (!ref) return { error: 'Сессия истекла — войдите заново', status: 401 };

  const employee = await resolveEmployee(ref);
  // 403, а не 404: уволенный и несуществующий должны выглядеть одинаково,
  // иначе ответ расскажет постороннему, кто в штате.
  if ('error' in employee) return { error: employee.error, status: 403 };
  return employee;
}

export async function GET(request: NextRequest) {
  try {
    const who = await actor(request, null);
    if ('error' in who) return NextResponse.json({ error: who.error }, { status: who.status });

    const open = await currentShift(who.id, new Date());
    return NextResponse.json({
      status: 'ok',
      open: open !== null,
      startedAt: open?.startedAt ?? null,
      openedVia: open?.openedVia ?? null,
    });
  } catch (error: unknown) {
    console.error('API Shift GET Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const who = await actor(request, body);
    if ('error' in who) return NextResponse.json({ error: who.error }, { status: who.status });

    const action = body?.action;
    const now = new Date();

    if (action === 'open') {
      const via = isShiftSource(body?.via) ? body.via : 'pwa';
      const shift = await openShift(who.id, now, via);
      // Экран владельца обязан увидеть, что человек вышел, без перезагрузки.
      publish('customers');
      // СКАЗАТЬ ЧЕЛОВЕКУ В TELEGRAM — не дожидаясь: смена уже открыта, и
      // молчание Telegram не повод отвечать ошибкой на успешное действие.
      // Внутри — отказ, если открыли в самом боте: там ответ уже есть.
      void announceShiftOpen(who.telegramId, shift.startedAt, via);
      return NextResponse.json({ status: 'ok', open: true, startedAt: shift.startedAt });
    }

    if (action === 'close') {
      const via = isShiftSource(body?.via) ? body.via : 'pwa';
      const closed = await closeShift(who.id, now);
      publish('customers');
      if (closed) void announceShiftClose(who.telegramId, closed.endedAt, via);
      // Закрывать было нечего — не ошибка: человек мог нажать дважды или
      // закрыть смену, которую уже закрыл вечерний проход.
      return NextResponse.json({
        status: 'ok',
        open: false,
        closed: closed !== null,
        startedAt: closed?.startedAt ?? null,
        endedAt: closed?.endedAt ?? null,
      });
    }

    return NextResponse.json({ error: 'Ожидалось action: open или close' }, { status: 400 });
  } catch (error: unknown) {
    console.error('API Shift POST Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';

import { publish } from '@/lib/realtime/bus';
import { safeError } from '@/lib/safeError';
import { staffActor } from '@/lib/staffActor';
import { announceShiftClose, announceShiftOpen } from '@/lib/shift/announce';
import { closeShift, currentShift, isShiftSource, openShift } from '@/lib/shift/store';
// ══════════════════════════════════════════════════════════════════════
// Своя смена: открыть, закрыть, узнать состояние.
//
// ЭТО ДВЕРЬ СОТРУДНИКА, А НЕ ВЛАДЕЛЬЦА. Соседняя `/api/admin/shifts`
// закрыта `isAuthorized` — владелец или ботовый секрет; заполняет её
// график смен. Отметить начало и конец СВОЕЙ смены человек не мог нигде:
// ни в приложении, ни в боте.
//
// ТРИ ДОРОГИ ВНУТРЬ, как у крошек трека:
//   · сессия сотрудника — из приложения и из веба;
//   · ключ устройства — из приложения на Android: фоновая служба должна
//     знать, идёт ли смена, когда сессии давно нет;
//   · ботовый секрет плюс `telegramId` в теле — из Telegram.
// Кто это, берём из подписи, а не из тела: телу здесь верить нельзя ровно
// по той же причине, по которой расстояние до клиента считает сервер.
//
// GET  — открыта ли смена и с какого времени.
// POST { action: 'open' | 'close', via?, telegramId? }
// ══════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const who = await staffActor(request, null);
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
    const who = await staffActor(request, body);
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

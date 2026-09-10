import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/adminAuth';
import { requireBotAuth } from '@/lib/botAuth';
import { deviceHolder } from '@/lib/deviceAuth';
import { publish } from '@/lib/realtime/bus';
import { safeError } from '@/lib/safeError';
import { recordPings, resolveEmployee, type EmployeeRef } from '@/lib/tracking/fieldDay';
import { readPingBatch } from '@/lib/tracking/ping';

// ══════════════════════════════════════════════════════════════════════
// Приём крошек трека.
//
// Двери две, и они разные по природе, поэтому обе описаны здесь явно:
//
//   · Telegram-бот — общий секрет (`requireBotAuth`) плюс `telegramId` в
//     теле. Бот пересылает трансляцию геопозиции и говорит, чью;
//   · PWA админки — сессия сотрудника. Кто это, берём из подписи, а не
//     из тела: телу здесь верить нельзя ровно по той же причине, по
//     которой расстояние до клиента считает сервер, а не телефон.
//
// ПАЧКОЙ, А НЕ ПО ОДНОЙ. Телефон копит точки, пока нет связи, и отдаёт их
// разом. Приём по одной означал бы сотню запросов после каждого подвала.
//
// В ЖУРНАЛ АУДИТА НЕ ПИШЕМ. Трансляция шлёт точку раз в минуту, и запись
// каждой в аудит утопила бы в шуме всё остальное — там, где ищут вход в
// админку и правку цены. Что смена включена, видно по самому треку.
// ══════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: 'Ожидалось тело запроса' }, { status: 400 });
    }

    // ТРИ ДВЕРИ, И КАЖДАЯ ЗНАЕТ ЧЕЛОВЕКА ПО-СВОЕМУ:
    //   · сессия — из браузера и из PWA;
    //   · ключ устройства — из приложения, когда экран погашен и сессии
    //     давно нет; он же единственный, кто называет сотрудника прямо,
    //     без поиска по имени;
    //   · общий секрет бота — из Telegram, с `telegramId` в теле.
    //
    // Порядок важен: у запроса из браузера секрета нет и быть не должно, а
    // у фоновой службы нет сессии.
    const session = getSession(request);
    let ref: EmployeeRef | null = null;
    // Ключ устройства называет сотрудника ПРЯМО, без поиска по имени: он
    // выдан этому человеку и этому телефону, и тёзка тут ничего не сломает.
    let employeeId: string | null = null;

    if (session && (session.role === 'ADMIN' || session.role === 'SELLER') && session.name) {
      ref = { name: session.name };
    } else {
      const device = await deviceHolder(request);
      if (device) employeeId = device.employeeId;
    }

    if (!ref && !employeeId && requireBotAuth(request)) {
      // `telegramId` приходит числом или строкой: JSON теряет точность на
      // больших id, и бот шлёт их строкой намеренно.
      const rawId = body.telegramId;
      const asText = typeof rawId === 'string' || typeof rawId === 'number' ? String(rawId) : '';
      if (!/^\d{1,19}$/.test(asText)) {
        return NextResponse.json({ error: 'Не указан telegramId' }, { status: 400 });
      }
      ref = { telegramId: BigInt(asText) };
    }

    if (ref) {
      const employee = await resolveEmployee(ref);
      if ('error' in employee) {
        // 403, а не 404: сотрудник может существовать и быть уволенным, и
        // разный ответ на эти два случая рассказал бы постороннему, кто в
        // штате. Тот же довод, что во входе по Telegram.
        return NextResponse.json({ error: employee.error }, { status: 403 });
      }
      employeeId = employee.id;
    }

    if (!employeeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Разбор и вся отбраковка — в чистом модуле: мусорная крошка
    // выбрасывается поштучно и молча, вся пачка из-за неё не пропадает.
    const pings = readPingBatch(body.pings, new Date());
    if (pings.length === 0) {
      // Не ошибка: пачка могла состоять из одних дублей или прыжков GPS.
      // Отвечаем честным нулём, чтобы отправитель не слал её заново.
      return NextResponse.json({ status: 'ok', stored: 0, days: [] });
    }

    const { stored, days } = await recordPings(employeeId, pings);

    // Карта владельца обязана увидеть, что человек поехал, без перезагрузки.
    if (stored > 0) publish('customers');

    return NextResponse.json({ status: 'ok', stored, days });
  } catch (error: unknown) {
    console.error('API Admin Tracking Ping POST Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

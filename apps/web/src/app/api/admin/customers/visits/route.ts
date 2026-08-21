import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';

import { actorOf, isStaff, unauthorized } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';
import { publish } from '@/lib/realtime/bus';
import { safeError } from '@/lib/safeError';
import {
  VISIT_CHANNEL,
  VISIT_NOTE_MAX,
  isVisitType,
  visitOutcome,
} from '@/lib/customers/visits';

// ══════════════════════════════════════════════════════════════════════
// Отметка визита с карты.
//
// Карта показывала, КУДА ехать, но не помнила, что там уже были. Через
// неделю объезда это вопрос «я к ним заезжал или собирался?», на который
// отвечала только память.
//
// Пишем в `interactions` — ту же таблицу, куда офис пишет касания: своя
// таблица визитов развела бы историю общения по двум местам, и карточка
// клиента показывала бы половину.
//
// Дверь закрыта дважды: правилом в middleware и проверкой здесь. Отмечает
// тот, кто съездил, — а ездит продавец, поэтому рубеж на STAFF.
// ══════════════════════════════════════════════════════════════════════

/** Насколько старую отметку принимаем: столько же держит очередь клиента. */
const MAX_BACKDATE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Момент визита: из тела запроса, зажатый в разумное окно.
 *
 * Без значения — сейчас: обычная отметка со связью.
 */
function clampVisitedAt(raw: unknown): Date {
  const now = Date.now();
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return new Date(now);
  return new Date(Math.min(now, Math.max(now - MAX_BACKDATE_MS, raw)));
}

export async function POST(request: NextRequest) {
  if (!isStaff(request)) return unauthorized();

  try {
    const body = await request.json().catch(() => null);

    const customerId = Number(body?.customerId);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return NextResponse.json({ error: 'Некорректный id клиента' }, { status: 400 });
    }

    const type = body?.type;
    if (!isVisitType(type)) {
      return NextResponse.json({ error: 'Неизвестный результат визита' }, { status: 400 });
    }

    // Заметку режем, а не отклоняем: человек уже съездил, и терять отметку
    // из-за длины было бы обиднее, чем потерять хвост заметки.
    const note =
      typeof body?.note === 'string' ? body.note.trim().slice(0, VISIT_NOTE_MAX) : '';

    // Время визита приходит от клиента — ради отметок, сделанных без связи:
    // они уходят на сервер часами позже, и без этого поля вчерашняя поездка
    // легла бы сегодняшним числом.
    //
    // Значение зажато в окно [неделя назад; сейчас]. Не потому, что
    // сотруднику не доверяем, а потому что сбитые часы телефона — обычное
    // дело, и отметка «из 2019 года» портит журнал молча.
    const visitedAt = clampVisitedAt(body?.visitedAt);

    // Клиента проверяем ДО вставки: `customer_id` в interactions
    // необязателен, и запись о визите к несуществующему клиенту легла бы
    // в базу молча — висячей строкой, которую никто никогда не увидит.
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true, companyName: true },
    });
    if (!customer) {
      return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });
    }

    const outcome = visitOutcome(type)!;
    const interaction = await prisma.interaction.create({
      data: {
        customerId,
        createdAt: visitedAt,
        channel: VISIT_CHANNEL,
        interactionType: type,
        summary: note || outcome.ru,
        // «Договорились» и «отказ» — закрытые вопросы. «Перезвонить» и «не
        // застал» ждут продолжения, и отмечать их решёнными значило бы
        // спрятать хвост работы.
        resolved: type === 'visit_deal' || type === 'visit_refused',
      },
      select: { id: true, createdAt: true },
    });

    audit({
      action: 'customer.visit',
      ...actorOf(request),
      ip: request.headers.get('x-forwarded-for') ?? undefined,
      target: `#${customerId} ${customer.companyName ?? customer.name ?? ''}`.trim(),
      meta: { type },
    });

    // Отметка меняет и карточку, и карту: соседняя вкладка обязана увидеть
    // «были сегодня», а не показывать точку неотмеченной.
    publish('customers');

    return NextResponse.json({
      status: 'ok',
      interaction,
      message: `Отмечено: ${outcome.ru.toLowerCase()}`,
    });
  } catch (error: unknown) {
    console.error('API Admin Customers Visits POST Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

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
import { metersBetween } from '@/lib/customers/visitProof';

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

/**
 * Позиция телефона из тела запроса.
 *
 * Необязательна и остаётся такой: GPS в подвале ресторана не берётся,
 * а отказать честному продавцу в отметке дороже, чем записать её без
 * подтверждения места. Пусто здесь значит «не подтверждено», а не
 * «визита не было».
 *
 * Мусор молча отбрасываем: кривая координата хуже отсутствующей —
 * она нарисует «в 5000 км от клиента» и обвинит человека числом.
 */
function readCoords(body: Record<string, unknown> | null): {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
} | null {
  const lat = Number(body?.latitude);
  const lon = Number(body?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  if (lat === 0 && lon === 0) return null;

  const acc = Number(body?.accuracyM);
  return {
    latitude: lat,
    longitude: lon,
    accuracyM: Number.isFinite(acc) && acc >= 0 ? Math.round(acc) : null,
  };
}

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
      select: {
        id: true,
        name: true,
        companyName: true,
        latitude: true,
        longitude: true,
      },
    });
    if (!customer) {
      return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });
    }

    // ── Подтверждение места ───────────────────────────────────────────
    //
    // Расстояние считает СЕРВЕР, а не телефон. Присланному «я был в 12
    // метрах» верить нельзя по определению: тело запроса пишет тот, чью
    // добросовестность мы и проверяем.
    //
    // Без пина у клиента расстояние не от чего считать — тогда пишем
    // только позицию: она пригодится, когда пин наконец поставят.
    const at = readCoords(body as Record<string, unknown> | null);
    const distanceM =
      at && customer.latitude !== null && customer.longitude !== null
        ? metersBetween(at, {
            latitude: customer.latitude,
            longitude: customer.longitude,
          })
        : null;

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
        latitude: at?.latitude ?? null,
        longitude: at?.longitude ?? null,
        accuracyM: at?.accuracyM ?? null,
        distanceM,
      },
      select: { id: true, createdAt: true },
    });

    audit({
      action: 'customer.visit',
      ...actorOf(request),
      ip: request.headers.get('x-forwarded-for') ?? undefined,
      target: `#${customerId} ${customer.companyName ?? customer.name ?? ''}`.trim(),
      // Расстояние в журнале аудита намеренно: именно по нему владелец
      // однажды спросит «а был ли», и ответ должен лежать рядом с
      // действием, а не собираться выборкой по таблице.
      meta: { type, distanceM, accuracyM: at?.accuracyM ?? null },
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

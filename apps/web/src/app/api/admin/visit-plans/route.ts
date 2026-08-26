import { NextRequest, NextResponse } from 'next/server';

import { actorOf, getSession, isStaff, unauthorized } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';
import { planSource, resolveReadAssignee, resolveSaveAssignee } from '@/lib/customers/planAssignee';
import { readDayFacts, readDayPlans, saveDayPlan } from '@/lib/customers/visitPlanStore';
import { publish } from '@/lib/realtime/bus';
import { safeError } from '@/lib/safeError';

// ══════════════════════════════════════════════════════════════════════
// План объезда: сохранить и прочитать.
//
// ЧТО ЭТО МЕНЯЕТ. План жил в localStorage телефона: продавец собирал его
// себе сам, владелец не видел и назначить не мог. Такой план — помощь
// памяти, но не инструмент, потому что составляет и отчитывается один
// человек.
//
// КТО ЧТО ВИДИТ, и это главное решение файла:
//
//   • продавец видит и переписывает ТОЛЬКО свой план — чужой ему не нужен
//     и знать о нём незачем;
//   • владелец видит все планы на дату и может назначить план любому.
//
// Разделение по `assignee`, а не по правам на роут: роут один, а рубеж
// внутри. Отдельный «продавцовский» адрес пришлось бы держать в согласии
// с владельческим, и однажды они разошлись бы.
//
// ИСПОЛНЕНИЕ СЧИТАЕТСЯ ПО ОТМЕТКАМ ВИЗИТОВ (см. visitPlanStore), а не
// хранится в плане. Поэтому «выполнено» здесь нельзя проставить запросом —
// закрывает остановку только настоящая поездка с координатой.
// ══════════════════════════════════════════════════════════════════════

/** Дата из строки `YYYY-MM-DD`. Без неё и с мусором — сегодня. */
function readDate(raw: string | null): Date {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

/**
 * Как зовут того, кто пришёл.
 *
 * Сотрудник опознаётся ИМЕНЕМ — так же, как в `Task.assignee` и в подписи
 * чека кассы: в сессии есть `name`, связи с `Employee` у неё нет. Заводить
 * её ради плана значило бы менять вход в админку.
 */
function actorName(request: NextRequest): string {
  const session = getSession(request);
  return session?.name?.trim() || (session?.role === 'ADMIN' ? 'Владелец' : 'Продавец');
}

function isOwner(request: NextRequest): boolean {
  return getSession(request)?.role === 'ADMIN';
}

export async function GET(request: NextRequest) {
  if (!isStaff(request)) return unauthorized();

  try {
    const sp = new URL(request.url).searchParams;
    const planDate = readDate(sp.get('date'));

    // Продавцу — только его собственный план. Владельцу — все, если он не
    // спросил чей-то конкретный.
    const assignee = resolveReadAssignee({
      isOwner: isOwner(request),
      actor: actorName(request),
      requested: sp.get('assignee'),
    });

    const plans = await readDayPlans({ planDate, assignee });

    // День целиком, а не только план: визит без плана и чек с выезда — это
    // и есть работа, и до сих пор их не было видно ни на одном экране.
    // Отдаём той же дверью: второй адрес пришлось бы держать в согласии.
    const facts = await readDayFacts({ planDate, assignee });

    return NextResponse.json({ status: 'ok', plans, ...facts });
  } catch (error: unknown) {
    console.error('API Admin Visit Plans GET Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isStaff(request)) return unauthorized();

  try {
    const body = (await request.json().catch(() => null)) as {
      date?: unknown;
      assignee?: unknown;
      customerIds?: unknown;
    } | null;

    const ids = Array.isArray(body?.customerIds)
      ? body.customerIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: 'План пуст — нечего сохранять' }, { status: 400 });
    }

    const owner = isOwner(request);
    const author = actorName(request);

    // Назначить план другому может только владелец. Продавец сохраняет
    // исключительно себе — иначе он мог бы переписать чужой день.
    const assignee = resolveSaveAssignee({
      isOwner: owner,
      actor: author,
      requested: typeof body?.assignee === 'string' ? body.assignee : '',
    });

    const planDate = readDate(typeof body?.date === 'string' ? body.date : null);
    const saved = await saveDayPlan({
      planDate,
      assignee,
      author,
      source: planSource({ assignee, author }),
      customerIds: ids,
    });

    audit({
      action: 'visit.plan.save',
      ...actorOf(request),
      ip: request.headers.get('x-forwarded-for') ?? undefined,
      target: `${planDate.toISOString().slice(0, 10)} → ${assignee || 'ничей'}`,
      meta: { stops: saved.stops },
    });

    // Соседняя вкладка владельца обязана увидеть новый план, а не вчерашний.
    publish('customers');

    return NextResponse.json({ status: 'ok', plan: saved }, { status: 201 });
  } catch (error: unknown) {
    console.error('API Admin Visit Plans POST Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

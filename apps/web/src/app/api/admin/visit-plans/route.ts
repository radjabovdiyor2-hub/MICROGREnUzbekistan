import { NextRequest, NextResponse } from 'next/server';

import { actorOf, getSession, isStaff, unauthorized } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';
import { planSource, resolveReadAssignee, resolveSaveAssignee } from '@/lib/customers/planAssignee';
import { deleteDayPlan, readDayFacts, readDayPlans, saveDayPlan } from '@/lib/customers/visitPlanStore';
import { prisma } from '@repo/database';

import { notifyCustomer } from '@/lib/notify';
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
 *
 * ПУСТО У ПРОДАВЦА — ЭТО ОТКАЗ, А НЕ ЗАГЛУШКА. Здесь стояло «Продавец»
 * подстановкой, и это тихая ловушка: план такого человека лёг бы под
 * литеральным именем «Продавец», с `Employee` не совпал бы никогда (значит
 * и уведомления не было бы), а двое безымянных делили бы ОДНУ строку —
 * уникальность стоит по паре (дата, исполнитель), и второй молча переписал
 * бы день первому. Сейчас имя есть у каждого продавца (вход через Telegram
 * кладёт `employee.name`), и заглушка не нужна: если её однажды не станет,
 * лучше увидеть отказ, чем чужой объезд.
 *
 * У владельца имени в сессии нет вовсе — вход по паролю и по ключу его не
 * кладут, — и это не мешает: владелец видит все планы и назначает по имени
 * сотрудника, а не по своему.
 */
function actorName(request: NextRequest): string | null {
  const session = getSession(request);
  const name = session?.name?.trim();
  if (name) return name;
  return session?.role === 'ADMIN' ? 'Владелец' : null;
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
    const actor = actorName(request);
    if (actor === null) {
      return NextResponse.json({ error: 'Сотрудник не опознан' }, { status: 403 });
    }

    const assignee = resolveReadAssignee({
      isOwner: isOwner(request),
      actor,
      requested: sp.get('assignee'),
      // `mine=1` просит экран, которому нужен ТОЛЬКО свой план.
      mine: sp.get('mine') === '1',
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
      items?: unknown;
    } | null;

    const ids = Array.isArray(body?.customerIds)
      ? body.customerIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: 'План пуст — нечего сохранять' }, { status: 400 });
    }

    const owner = isOwner(request);
    const author = actorName(request);
    if (author === null) {
      return NextResponse.json({ error: 'Сотрудник не опознан' }, { status: 403 });
    }

    // Назначить план другому может только владелец. Продавец сохраняет
    // исключительно себе — иначе он мог бы переписать чужой день.
    const assignee = resolveSaveAssignee({
      isOwner: owner,
      actor: author,
      requested: typeof body?.assignee === 'string' ? body.assignee : '',
    });

    // Что взять с собой. Поля нет — список не трогаем (объезд пересобрали,
    // а загрузку машины оставили); пустой массив — очистили осознанно.
    const items = Array.isArray(body?.items)
      ? body.items
          .map((raw) => raw as { productId?: unknown; qty?: unknown })
          .map((raw) => ({
            productId: typeof raw.productId === 'string' ? raw.productId : '',
            qty: Number(raw.qty),
          }))
          .filter((item) => item.productId !== '' && Number.isInteger(item.qty) && item.qty > 0)
      : undefined;

    const planDate = readDate(typeof body?.date === 'string' ? body.date : null);
    const saved = await saveDayPlan({
      planDate,
      assignee,
      author,
      source: planSource({ assignee, author }),
      customerIds: ids,
      items,
    });

    audit({
      action: 'visit.plan.save',
      ...actorOf(request),
      ip: request.headers.get('x-forwarded-for') ?? undefined,
      target: `${planDate.toISOString().slice(0, 10)} → ${assignee || 'ничей'}`,
      meta: { stops: saved.stops, items: saved.items },
    });

    // Соседняя вкладка владельца обязана увидеть новый план, а не вчерашний.
    publish('customers');

    // ── Назначенный НЕ СЕБЕ план надо кому-то сообщить ────────────────
    //
    // План на сервере появился, а продавец о нём не узнавал ничем: чтобы
    // увидеть свой день, надо было самому открыть админку и догадаться
    // туда заглянуть. Владелец при этом считал, что поручил работу.
    //
    // Сотрудник опознаётся именем — так же, как в самом плане и в
    // `Task.assignee`; Telegram берём из карточки сотрудника. Нет связки с
    // Telegram — молчим: отправить некуда, а падать из-за этого запрос не
    // должен, план уже сохранён.
    if (owner && assignee && assignee !== author) {
      void (async () => {
        try {
          const employee = await prisma.employee.findFirst({
            where: { name: assignee, isActive: true },
            select: { telegramId: true },
          });
          if (!employee?.telegramId) return;
          const day = planDate.toLocaleDateString('ru-RU');
          await notifyCustomer(
            employee.telegramId,
            `🗺 Вам назначен объезд на ${day}: ${saved.stops} точек.\n`
            + 'Откройте «Клиенты» → карта, план уже там.',
          );
        } catch (err) {
          console.error('[visit-plans] не сказали продавцу о плане:', err);
        }
      })();
    }

    return NextResponse.json({ status: 'ok', plan: saved }, { status: 201 });
  } catch (error: unknown) {
    console.error('API Admin Visit Plans POST Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

/**
 * Убрать объезд дня.
 *
 * КТО ЧТО МОЖЕТ. Владелец удаляет любой план на дату, продавец — только
 * свой: тот же рубеж, что на сохранении, и по той же причине. Имя берётся
 * из подписи, а не из адреса, поэтому «удалить чужой» продавцу недоступно
 * даже подстановкой параметра.
 *
 * ОТМЕТКИ ВИЗИТОВ НЕ ТРОГАЕМ. Поездка, которая состоялась, не перестаёт
 * быть фактом оттого, что план отменили; по ней же считается исполнение.
 * Удаляется план и его содержимое, а не история работы.
 */
export async function DELETE(request: NextRequest) {
  if (!isStaff(request)) return unauthorized();

  try {
    const sp = new URL(request.url).searchParams;
    const planDate = readDate(sp.get('date'));

    const actor = actorName(request);
    if (actor === null) {
      return NextResponse.json({ error: 'Сотрудник не опознан' }, { status: 403 });
    }

    // Тот же помощник, что и на сохранении: владелец назначает и снимает
    // кому угодно, продавец — только себе. Развести эти два правила
    // значило бы однажды дать продавцу стереть чужой день.
    const assignee = resolveSaveAssignee({
      isOwner: isOwner(request),
      actor,
      requested: sp.get('assignee') ?? '',
    });

    const removed = await deleteDayPlan({ planDate, assignee });

    if (removed) {
      audit({
        action: 'visit.plan.delete',
        ...actorOf(request),
        ip: request.headers.get('x-forwarded-for') ?? undefined,
        target: `${planDate.toISOString().slice(0, 10)} → ${assignee || 'ничей'}`,
      });
      publish('customers');
    }

    // Отсутствие плана — не ошибка: повторное нажатие выглядит так же.
    return NextResponse.json({ status: 'ok', removed });
  } catch (error: unknown) {
    console.error('API Admin Visit Plans DELETE Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

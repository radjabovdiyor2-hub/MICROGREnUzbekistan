import { NextRequest, NextResponse } from 'next/server';
import { prisma, Prisma } from '@repo/database';
import { safeError } from '@/lib/safeError';
import { actorOf, getSession, isAuthorized, isStaff, unauthorized } from '@/lib/adminAuth';
import { hidesMoney, maskSum } from '@/lib/customers/money';
import { audit } from '@/lib/audit';
import { getCustomerCard } from '@/lib/customers/card';
import {
  RETIRED_COMPANY_TYPES,
  isAudience,
  isCompanyType,
} from '@/lib/customers/companyTypes';
import { isDistrict } from '@/lib/customers/districts';
import { setCustomerBonus } from '@/lib/customers/bonus';
import { publish } from '@/lib/realtime/bus';

// ══════════════════════════════════════════════════════════════════════
// Клиенты админки.
//
// GET без параметров — список (страницами), GET ?id=<n> — карточка целиком
// с историей заказов и обращениями. Сбор карточки живёт в lib/customers:
// в route.ts Next.js разрешает экспортировать только HTTP-обработчики.
// ══════════════════════════════════════════════════════════════════════

/** Страница списка. Раньше стояло `take: 100` без сдвига — 101-й клиент
 *  был недостижим ничем, кроме поиска по имени. */
const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/** Сколько карточек показать в ответе чистки: список для глаз, а не выгрузка. */
const PURGE_PREVIEW = 200;

/**
 * Приметы учебного заведения в названии — для ПОДСКАЗКИ, не для удаления.
 *
 * Вуз приезжает не только под своим типом: «Столовая СамГУ» собирается
 * запросом «столовая» и ложится в базу как `canteen`, а чистка по типу его
 * не увидит. Удалять по названию автоматически нельзя — под «универ» подходит
 * и «Кафе Универсал», — поэтому такие карточки только перечисляются, а
 * решение принимает владелец поштучно (`DELETE ?id=`).
 */
const SCHOOL_HINTS = [
  'универ', 'институт', 'колледж', 'лицей', 'техникум', 'академи',
  'universitet', 'kollej', 'litsey', 'texnikum', 'akademiya', 'samdu',
];

export async function GET(request: NextRequest) {
  // Второй рубеж после middleware. Здесь ЧТЕНИЕ, и оно открыто продавцу:
  // он ездит по этим адресам. Запись — бонусы, статус, удаление — осталась
  // владельцу и проверяется своим `isAuthorized` в PUT и DELETE ниже.
  //
  // Полагаться на один рубеж там, где роут отдаёт телефоны и адреса всей
  // базы, — расчёт на то, что правило в middleware никогда не перепишут.
  if (!isStaff(request)) return unauthorized();

  try {
    const { searchParams } = new URL(request.url);
    const hideMoney = hidesMoney(getSession(request)?.role);

    // ── Карточка одного клиента ──────────────────────────────────────
    const idParam = searchParams.get('id');
    if (idParam) {
      const id = Number(idParam);
      if (!Number.isInteger(id) || id <= 0) {
        return NextResponse.json({ error: 'Invalid customer id' }, { status: 400 });
      }
      const card = await getCustomerCard(id, hideMoney);
      if (!card) {
        return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });
      }
      return NextResponse.json({ status: 'ok', customer: card });
    }

    // ── Список ───────────────────────────────────────────────────────
    const query = searchParams.get('q') || '';
    const filter = (searchParams.get('status') || '').toLowerCase();
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const limit = Math.min(Number(searchParams.get('limit')) || PAGE_SIZE, MAX_PAGE_SIZE);

    const where: Prisma.CustomerWhereInput = {};
    if (query) {
      // Телефон ищем по цифрам: в базе он записан в нескольких форматах
      // («+998 66 233-45-67», «998662334567», «662334567»), и поиск по строке
      // как её набрал человек промахивался мимо своего же клиента.
      const digits = query.replace(/\D/g, '');
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { phone: { contains: query, mode: 'insensitive' } },
        { telegramUsername: { contains: query, mode: 'insensitive' } },
        { companyName: { contains: query, mode: 'insensitive' } },
        ...(digits.length >= 4
          ? [{ phone: { contains: digits.slice(-9) } } as Prisma.CustomerWhereInput]
          : []),
      ];
    }

    // b2b — это ТИП клиента (customer_type), а не статус. Раньше значение
    // подставлялось в `where.status` как есть, поэтому кнопка «B2B» всегда
    // возвращала пустой список: статуса «b2b» в базе не бывает. Та же история
    // была с «client» — такого статуса нет вовсе (есть lead/active/vip/churned).
    if (filter === 'b2b' || filter === 'b2c') {
      where.customerType = filter;
    } else if (filter && filter !== 'all') {
      where.status = filter;
    }

    // Тип заведения, аудитория и район — те же фильтры, что у карты. Список
    // и карта это два вида ОДНОГО раздела, и набор вопросов к ним общий:
    // выбрать «тойхоны Ургута» на карте и не суметь того же в списке —
    // ровно та несогласованность, из-за которой люди перестают верить
    // фильтрам.
    const companyType = searchParams.get('companyType');
    const audience = searchParams.get('audience');
    const district = searchParams.get('district');
    if (isCompanyType(companyType)) where.companyType = companyType;
    // 'unknown' — заведения, у которых пол зала ещё не выяснен. Тот же
    // разбор, что у карты (buildMapWhere): списку и карте нельзя понимать
    // один и тот же параметр по-разному.
    if (audience === 'unknown') where.audience = null;
    else if (isAudience(audience)) where.audience = audience;
    // Район проверяем справочником, как тип и аудиторию: иначе в запрос
    // уходит любая строка из адресной строки, и пустой ответ выглядит как
    // «в этом районе никого нет» вместо «такого района не существует».
    if (isDistrict(district)) where.district = district;

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.customer.count({ where }),
    ]);

    return NextResponse.json({
      status: 'ok',
      total,
      page,
      hasMore: page * limit < total,
      customers: customers.map((c) => ({
        id: c.id,
        name: c.name || '—',
        phone: c.phone || '—',
        telegramId: c.telegramId ? c.telegramId.toString() : null,
        telegramUsername: c.telegramUsername || null,
        customerType: c.customerType,
        companyType: c.companyType || null,
        audience: c.audience || null,
        companyName: c.companyName || null,
        city: c.city,
        district: c.district || null,
        status: c.status,
        totalSpent: maskSum(Number(c.totalSpent || 0), hideMoney),
        bonusBalance: maskSum(Number(c.bonusBalance || 0), hideMoney),
        ordersCount: c.ordersCount,
        notes: c.notes || '',
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    console.error('API Admin Customers GET Error:', error);
    return NextResponse.json(
      { error: safeError(error) },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  try {
    const body = await request.json();
    const { id, status, bonusBalance, notes, city, companyName, companyType, audience } =
      body;

    if (!id) {
      return NextResponse.json({ error: 'Customer ID is required' }, { status: 400 });
    }
    const customerId = Number(id);

    // Баллы — отдельным путём: они лежат на аккаунте витрины, а не в карточке
    // CRM, и запись «как есть» в customers.bonus_balance ничего не начисляла.
    if (bonusBalance !== undefined) {
      const result = await setCustomerBonus(customerId, Number(bonusBalance));
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
    }

    const updated = await prisma.customer.update({
      where: { id: customerId },
      data: {
        status: status !== undefined ? status : undefined,
        notes: notes !== undefined ? notes : undefined,
        city: city !== undefined ? city : undefined,
        companyName: companyName !== undefined ? companyName : undefined,
        // Тип заведения тоже можно СНЯТЬ: «я ошибся, это не ресторан».
        // Без этой ветки форма предлагала пункт «Не указан», выбор которого
        // молча ничего не делал, — то есть врала о том, что произошло.
        ...(companyType === '' || isCompanyType(companyType)
          ? { companyType: companyType === '' ? null : companyType }
          : {}),
        // Аудиторию человек может и СНЯТЬ — пустая строка означает «не
        // выяснено», и это осмысленный ответ, а не отсутствие правки.
        // Проставленное здесь помечается 'manual': ночной сбор такое
        // значение своей догадкой по названию больше не затрёт.
        ...(audience === '' || isAudience(audience)
          ? {
              audience: audience === '' ? null : audience,
              audienceSource: audience === '' ? null : 'manual',
            }
          : {}),
      },
    });

    // Оповещение — здесь, на записи. Раньше `publish('customers')` стоял в
    // GET одиночной карточки: чтение рассылало всем клиентам инвалидацию
    // ключа `admin-customer`, те шли перечитывать карточку, и каждый их GET
    // рассылал следующую волну. Правка при этом не оповещала никого —
    // изменённый тип заведения не доезжал ни до карты, ни до списка в
    // соседней вкладке.
    publish('customers');

    return NextResponse.json({
      status: 'ok',
      customer: {
        id: updated.id,
        status: updated.status,
        bonusBalance: Number(updated.bonusBalance || 0),
        notes: updated.notes,
        city: updated.city,
        companyName: updated.companyName,
        companyType: updated.companyType,
        audience: updated.audience,
      },
    });
  } catch (error: unknown) {
    console.error('API Admin Customers PUT Error:', error);
    return NextResponse.json(
      { error: safeError(error) },
      { status: 500 }
    );
  }
}

/**
 * Удалить карточку клиента — одну (`?id=12`), все без заказов
 * (`?scope=no-orders`) или выведенные из справочника типы
 * (`?scope=retired-types`, безопасный просмотр — `&dryRun=1`).
 *
 * Удаления клиентов не было НИГДЕ: ни здесь, ни в боте, ни отдельным SQL.
 * В Telegram на «удали всех клиентов» бот отвечал, что это «серьёзное
 * действие, требующее отдельного рассмотрения», — то есть выдумывал
 * согласование там, где просто нет возможности. Теперь возможность живёт
 * здесь, у человека с админкой, а бот честно отсылает сюда.
 *
 * ⚠️ Клиента с заказами удалить НЕЛЬЗЯ, и это защита базы, а не наша:
 * `crm_orders.customer_id` объявлен `onDelete: Restrict` (schema.prisma).
 * Postgres такую строку не отдаст, и правильно — вместе с клиентом ушла бы
 * вся история продаж, по которой считаются все отчёты офиса. Отвечаем 409
 * с числом заказов, а не даём базе упасть с 500.
 *
 * ⚠️ У клиента БЕЗ заказов каскадом уходят `interactions` и `followups`
 * (обе связи `onDelete: Cascade`). Среди них — метки `b2b_offer_sent`, по
 * которым рассылка не пишет ресторану второй раз. Поэтому в ответе честно
 * возвращаем, сколько записей уйдёт вместе с карточкой.
 */
export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const sp = new URL(request.url).searchParams;
  const ip = request.headers.get('x-forwarded-for') ?? undefined;
  const scope = sp.get('scope');

  try {
    // ── Пачкой: все карточки без единого заказа ──────────────────────
    // Именно для сценария «удалим и заведём заново»: клиентов с заказами
    // такой запрос не тронет, поэтому история продаж остаётся целой.
    if (scope === 'no-orders') {
      const deletable = await prisma.customer.findMany({
        where: { crmOrders: { none: {} } },
        select: { id: true },
      });
      const ids = deletable.map((c) => c.id);
      const kept = await prisma.customer.count({ where: { crmOrders: { some: {} } } });

      const { count } = ids.length
        ? await prisma.customer.deleteMany({ where: { id: { in: ids } } })
        : { count: 0 };

      audit({
        action: 'customer.delete.bulk', ...actorOf(request), ip,
        target: `${count} шт.`, meta: { deleted: count, kept },
      });
      // Пачка удалений меняет и список, и карту разом — без оповещения
      // соседняя вкладка продолжила бы показывать удалённые точки.
      if (count) publish('customers');

      return NextResponse.json({
        status: 'ok',
        deleted: count,
        kept,
        message:
          `Удалено карточек: ${count}. ` +
          (kept
            ? `Осталось ${kept} — у них есть заказы, и база их не отдаёт: вместе с ними ушла бы история продаж.`
            : 'Клиентов с заказами не было.'),
      });
    }

    // ── Пачкой: типы, выведенные из справочника ──────────────────────
    // Вузы, колледжи, бизнес-центры, супермаркеты и клиники набрал ночной
    // сбор, пока эти категории были в `VENUE_QUERIES`. Категории убраны, но
    // собранное само не уходит: без этой ветки владелец видел бы их в списке
    // и на карте до конца времён, теперь ещё и сырым слагом.
    //
    // Условие намеренно у́же, чем «тип совпал»: карточку, которая покупала
    // или за которой стоит живой человек, чистка не трогает. Клиника,
    // берущая у нас зелень, остаётся клиентом — просто без места в фильтре.
    if (scope === 'retired-types') {
      const dryRun = sp.get('dryRun') === '1';
      const types = Object.keys(RETIRED_COMPANY_TYPES);

      const where: Prisma.CustomerWhereInput = {
        companyType: { in: types },
        crmOrders: { none: {} },
        status: 'lead',
        ordersCount: 0,
        totalSpent: 0,
        webUserId: null,
        telegramId: null,
      };
      const card = {
        id: true, name: true, companyName: true,
        city: true, companyType: true, district: true,
      } as const;

      const doomed = await prisma.customer.findMany({
        where, select: card, orderBy: { id: 'asc' },
      });
      const inRetired = await prisma.customer.count({
        where: { companyType: { in: types } },
      });
      const kept = inRetired - doomed.length;

      // Подсказка по названию собирается только в просмотре: в боевом
      // прогоне она никого не удаляет и лишь замедлила бы ответ.
      const suspects = dryRun
        ? await prisma.customer.findMany({
            where: {
              NOT: { companyType: { in: types } },
              OR: SCHOOL_HINTS.flatMap((hint) => [
                { name: { contains: hint, mode: 'insensitive' } },
                { companyName: { contains: hint, mode: 'insensitive' } },
              ]) as Prisma.CustomerWhereInput[],
            },
            select: card,
            orderBy: { id: 'asc' },
            take: PURGE_PREVIEW,
          })
        : [];

      const ids = doomed.map((c) => c.id);
      const { count } = !dryRun && ids.length
        ? await prisma.customer.deleteMany({ where: { id: { in: ids } } })
        : { count: 0 };

      if (!dryRun) {
        audit({
          action: 'customer.delete.retired', ...actorOf(request), ip,
          target: `${count} шт.`, meta: { deleted: count, kept, types },
        });
        if (count) publish('customers');
      }

      return NextResponse.json({
        status: 'ok',
        dryRun,
        types,
        matched: doomed.length,
        deleted: count,
        kept,
        preview: doomed.slice(0, PURGE_PREVIEW),
        suspects,
        message:
          (dryRun
            ? `Под чистку попадает карточек: ${doomed.length}. Ничего не удалено — это просмотр.`
            : `Удалено карточек: ${count}.`) +
          (kept
            ? ` Ещё ${kept} того же типа оставлены: за ними заказ, аккаунт или работа продавца.`
            : '') +
          (suspects.length
            ? ` Отдельно: ${suspects.length} карточек с учебным словом в названии, но под другим типом — посмотрите глазами, автоматически они не удаляются.`
            : ''),
      });
    }

    // ── Одна карточка ────────────────────────────────────────────────
    const id = Number(sp.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        { error: 'Нужен числовой id или scope=no-orders / retired-types' },
        { status: 400 }
      );
    }

    const customer = await prisma.customer.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        _count: { select: { crmOrders: true, interactions: true, followups: true } },
      },
    });
    if (!customer) {
      return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });
    }

    // Проверяем ДО удаления: иначе Postgres ответит нарушением внешнего
    // ключа, и владелец увидит 500 вместо объяснения, почему нельзя.
    if (customer._count.crmOrders > 0) {
      return NextResponse.json(
        {
          error:
            `У клиента ${customer._count.crmOrders} заказ(ов) — удалить нельзя: ` +
            `вместе с карточкой пропала бы история продаж, по которой считаются отчёты. ` +
            `Если клиент больше не нужен, поставьте ему статус «churned».`,
          ordersCount: customer._count.crmOrders,
        },
        { status: 409 }
      );
    }

    await prisma.customer.delete({ where: { id } });

    audit({
      action: 'customer.delete', ...actorOf(request), ip,
      target: `#${id} ${customer.name ?? ''}`.trim(),
      meta: {
        interactions: customer._count.interactions,
        followups: customer._count.followups,
      },
    });
    publish('customers');

    return NextResponse.json({
      status: 'ok',
      deleted: 1,
      cascaded: {
        interactions: customer._count.interactions,
        followups: customer._count.followups,
      },
      message:
        `Клиент «${customer.name ?? id}» удалён.` +
        (customer._count.interactions || customer._count.followups
          ? ` Вместе с ним удалено обращений: ${customer._count.interactions}, напоминаний: ${customer._count.followups}.`
          : ''),
    });
  } catch (error: unknown) {
    console.error('API Admin Customers DELETE Error:', error);
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { byBusinessDate } from '@/lib/revenue/salesLedger';
import { EMPLOYEE_ROLE_VALUES } from '@/components/admin/employeeOptions';
import { LIST_LIMIT } from '@/lib/api/listLimit';

// ==========================================
// Employees API — Seller Management
// ==========================================

/**
 * Telegram ID сотрудника: строка из формы → BigInt для базы.
 *
 * По этой колонке продавец входит в кассу из Mini App без PIN
 * (`/api/auth/telegram-staff`). Колонка существовала с самого начала и не
 * заполнялась ничем: формы для неё не было, а без неё дверь заперта.
 *
 * `null` — «очистить связку», `undefined` — «не трогать». Разница важна:
 * пустое поле формы должно снимать привязку, а отсутствие поля в теле —
 * нет, иначе правка телефона обнуляла бы вход человека.
 */
function parseTelegramId(raw: unknown): bigint | null | undefined | NextResponse {
  if (raw === undefined) return undefined;
  const text = String(raw ?? '').trim();
  if (!text) return null;
  if (!/^\d{5,20}$/.test(text)) {
    return NextResponse.json(
      { error: `Telegram ID faqat raqamlardan iborat: ${text}` },
      { status: 400 },
    );
  }
  return BigInt(text);
}

/**
 * Занятый Telegram ID — внятный отказ вместо «Xatolik yuz berdi».
 *
 * Колонка уникальна: один Telegram = один сотрудник, иначе вход по подписи
 * не знал бы, чью роль выдавать. Без этой ветки владелец видел бы общую
 * пятисотку и не понял, что ID уже стоит у другого человека.
 */
function takenTelegramId(error: unknown): NextResponse | null {
  const code = (error as { code?: string } | null)?.code;
  const target = (error as { meta?: { target?: unknown } } | null)?.meta?.target;
  if (code !== 'P2002') return null;
  if (!String(target ?? '').includes('telegram')) return null;
  return NextResponse.json(
    { error: 'Bu Telegram ID boshqa xodimga biriktirilgan' },
    { status: 400 },
  );
}

/** Ответ клиенту: BigInt в JSON не сериализуется и уронил бы весь список. */
function forClient(employee: Record<string, unknown>) {
  return {
    ...employee,
    pin: undefined,
    telegramId: employee.telegramId == null ? null : String(employee.telegramId),
  };
}

function badRole(role: unknown): NextResponse | null {
  if (role === undefined || role === null || role === '') return null;
  if (EMPLOYEE_ROLE_VALUES.includes(String(role))) return null;
  return NextResponse.json(
    { error: `Noma'lum lavozim: ${role}. Ruxsat etilgan: ${EMPLOYEE_ROLE_VALUES.join(', ')}` },
    { status: 400 },
  );
}

// GET — List employees with today's sales stats
export async function GET() {
  const employees = await prisma.employee.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    take: LIST_LIMIT,
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  // Продажи сотрудника за сегодня. Признак продажи тот же, что и в общем
  // реестре выручки (lib/revenue/salesLedger): движение расхода без привязки
  // к заказу и с зафиксированной ценой продажи.
  //
  // Раньше фильтр шёл по префиксу «Do'kon sotish», из-за чего продажи в долг
  // («Qarzga sotish») сотруднику не засчитывались вовсе, а выручка считалась
  // по СЕГОДНЯШНЕМУ прайсу вместо цены, по которой продали.
  const todayMovements = await prisma.stockMovement.findMany({
    where: {
      type: 'OUT',
      orderId: null,
      salePrice: { not: null },
      // Деловая дата, а не время записи: продажа, занесённая сегодня за
      // вчера, принадлежит вчерашней смене этого же продавца.
      ...byBusinessDate({ gte: today, lte: endOfDay }),
    },
  });

  const result = employees.map(emp => {
    const empSales = todayMovements.filter(m => m.performedBy === emp.name);
    const todaySalesCount = empSales.length;
    const todayRevenue = empSales.reduce(
      (s, m) => s + Math.round(Math.abs(m.quantity) * (m.salePrice ?? 0)), 0,
    );

    return { ...forClient(emp), todaySalesCount, todayRevenue };
  });

  return NextResponse.json({ employees: result });
}

// POST — Create employee
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // department и city раньше не читались вовсе: колонки в базе есть,
    // график смен их показывает, но заполнить их было нечем — у каждого
    // сотрудника отдел оставался пустым навсегда.
    const { name, pin, phone, role, department, city, telegramId } = body;

    if (!name || !pin) {
      return NextResponse.json({ error: "Ism va PIN majburiy" }, { status: 400 });
    }

    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: "PIN 4 ta raqamdan iborat bo'lishi kerak" }, { status: 400 });
    }

    const roleError = badRole(role);
    if (roleError) return roleError;

    // Check PIN uniqueness
    const existing = await prisma.employee.findUnique({ where: { pin } });
    if (existing) {
      return NextResponse.json({ error: "Bu PIN allaqachon ishlatilmoqda" }, { status: 400 });
    }

    const tg = parseTelegramId(telegramId);
    if (tg instanceof NextResponse) return tg;

    const employee = await prisma.employee.create({
      data: {
        name, pin,
        phone: phone || null,
        role: role || 'seller',
        department: department || null,
        ...(city ? { city: String(city) } : {}),
        ...(tg === undefined ? {} : { telegramId: tg }),
      },
    });

    return NextResponse.json({ success: true, employee: forClient(employee) });
  } catch (error) {
    const taken = takenTelegramId(error);
    if (taken) return taken;
    console.error('Employee create error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

// PUT — Update employee
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json({ error: 'Employee ID majburiy' }, { status: 400 });
    }

    if (data.pin) {
      if (data.pin.length !== 4 || !/^\d{4}$/.test(data.pin)) {
        return NextResponse.json({ error: "PIN 4 ta raqamdan iborat bo'lishi kerak" }, { status: 400 });
      }
      const existing = await prisma.employee.findFirst({
        where: { pin: data.pin, id: { not: id } },
      });
      if (existing) {
        return NextResponse.json({ error: "Bu PIN allaqachon ishlatilmoqda" }, { status: 400 });
      }
    }

    const roleError = badRole(data.role);
    if (roleError) return roleError;

    // Белый список полей: раньше тело разворачивалось целиком, и клиент мог
    // переписать любую колонку — включая isActive и totalSales.
    const allowed = ['name', 'pin', 'phone', 'role', 'department', 'city', 'isActive'];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in data) patch[key] = data[key] === '' ? null : data[key];
    }

    // Telegram ID отдельно от белого списка: он требует разбора и своей
    // ошибки, а строка «12345» в колонке BigInt уронила бы запрос молча.
    if ('telegramId' in data) {
      const tg = parseTelegramId(data.telegramId);
      if (tg instanceof NextResponse) return tg;
      patch.telegramId = tg ?? null;
    }

    const employee = await prisma.employee.update({ where: { id }, data: patch });
    return NextResponse.json({ success: true, employee: forClient(employee) });
  } catch (error) {
    const taken = takenTelegramId(error);
    if (taken) return taken;
    console.error('Employee update error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

// DELETE — Deactivate employee
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Employee ID majburiy' }, { status: 400 });
    }

    await prisma.employee.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Employee delete error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

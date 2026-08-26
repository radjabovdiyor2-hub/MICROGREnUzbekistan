import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@repo/database';
import { LIST_LIMIT } from '@/lib/api/listLimit';
import { parseBody } from '@/lib/api/parseBody';

// ══════════════════════════════════════════════════════════════════════
// Долги: кто кому должен.
//
// ⚠️ ЗДЕСЬ ЛЕЖАЛИ ДВА ДЕНЕЖНЫХ ДЕФЕКТА, и оба тихие.
//
// 1. Правка долга принимала тело ЦЕЛИКОМ: `const { id, payment, ...other }`
//    и `data: other` прямо в `prisma.debt.update`. То есть кто угодно с
//    доступом мог прислать `{ id, isPaid: true }` или `{ id, paidAmount: 0 }`
//    и пометить любой долг закрытым, не заплатив ничего. В журнале это
//    выглядит как обычная правка.
//
// 2. Ни сумма долга, ни сумма платежа не проверялись: строка вместо числа
//    роняла запрос в 500 из глубины Prisma, отрицательный платёж УМЕНЬШАЛ
//    выплаченное, а платёж больше долга уводил остаток в минус.
//
// Теперь тело разбирается схемой, а на правку допущен закрытый список
// полей. Деньги меняются ровно одним способом — платежом.
// ══════════════════════════════════════════════════════════════════════

/** Сумма в сумах: целая, больше нуля и в пределах разумного. */
const money = z.number().int().positive().max(1_000_000_000);

const createSchema = z.object({
  type: z.enum(['WHO_OWES_US', 'WE_OWE']),
  personName: z.string().trim().min(1).max(200),
  amount: money,
  phone: z.string().trim().max(20).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  dueDate: z.string().optional().nullable(),
  supplierId: z.string().optional().nullable(),
});

/**
 * Правка. `payment` — единственный способ изменить деньги; остальные поля
 * описательные. `isPaid` и `paidAmount` сюда не входят НАМЕРЕННО: они
 * следствие платежей, а не то, что назначают снаружи.
 */
const updateSchema = z.object({
  id: z.string().min(1),
  payment: money.optional(),
  personName: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().max(20).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  dueDate: z.string().optional().nullable(),
});

// GET — List debts with filters
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type'); // WHO_OWES_US | WE_OWE
  const status = searchParams.get('status'); // all | unpaid | overdue | paid

  const where: Record<string, unknown> = {};
  if (type) where.type = type;

  if (status === 'unpaid') where.isPaid = false;
  else if (status === 'paid') where.isPaid = true;
  else if (status === 'overdue') {
    where.isPaid = false;
    where.dueDate = { lt: new Date() };
  }

  const debts = await prisma.debt.findMany({
    where,
    include: {
      supplier: { select: { name: true, phone: true } },
    },
    orderBy: [{ isPaid: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    take: LIST_LIMIT,
  });

  // Calculate summaries
  const allDebts = await prisma.debt.findMany({
    where: { isPaid: false },
    select: { type: true, amount: true, paidAmount: true, dueDate: true },
  });

  const summary = {
    theyOweUs: allDebts.filter(d => d.type === 'WHO_OWES_US').reduce((s, d) => s + (d.amount - d.paidAmount), 0),
    weOwe: allDebts.filter(d => d.type === 'WE_OWE').reduce((s, d) => s + (d.amount - d.paidAmount), 0),
    overdue: allDebts.filter(d => d.dueDate && d.dueDate < new Date()).length,
    totalCount: allDebts.length,
  };

  return NextResponse.json({ debts, summary });
}

// POST — Create a new debt
export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, createSchema);
    if (!parsed.ok) return parsed.response;
    const { type, personName, phone, amount, description, dueDate, supplierId } = parsed.data;

    const due = dueDate ? new Date(dueDate) : null;
    if (due && Number.isNaN(due.getTime())) {
      return NextResponse.json({ error: 'Некорректный срок' }, { status: 400 });
    }

    const debt = await prisma.debt.create({
      data: {
        type,
        personName,
        phone: phone || null,
        amount,
        paidAmount: 0,
        description: description || null,
        dueDate: due,
        supplierId: supplierId || null,
        isPaid: false,
      },
    });

    return NextResponse.json({ success: true, debt });
  } catch (error) {
    console.error('Debt create error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

// PUT — Update debt or make a payment
export async function PUT(request: NextRequest) {
  try {
    const parsed = await parseBody(request, updateSchema);
    if (!parsed.ok) return parsed.response;
    const { id, payment, ...fields } = parsed.data;

    const debt = await prisma.debt.findUnique({ where: { id } });
    if (!debt) {
      return NextResponse.json({ error: 'Qarz topilmadi' }, { status: 404 });
    }

    // ── Платёж ────────────────────────────────────────────────────────
    if (payment) {
      const remainingBefore = debt.amount - debt.paidAmount;
      if (remainingBefore <= 0) {
        return NextResponse.json({ error: 'Долг уже закрыт' }, { status: 409 });
      }
      // Переплату не принимаем: лишние деньги в `paidAmount` уводят остаток
      // в минус, и «сколько нам должны» перестаёт сходиться по всей базе.
      if (payment > remainingBefore) {
        return NextResponse.json(
          { error: `Платёж больше остатка. Осталось: ${remainingBefore}` },
          { status: 400 },
        );
      }

      const newPaidAmount = debt.paidAmount + payment;
      const isPaid = newPaidAmount >= debt.amount;

      const updated = await prisma.debt.update({
        where: { id },
        data: { paidAmount: newPaidAmount, isPaid },
      });

      return NextResponse.json({
        success: true,
        debt: updated,
        remaining: Math.max(0, debt.amount - newPaidAmount),
        isPaid,
      });
    }

    // ── Правка описательных полей ─────────────────────────────────────
    //
    // Только то, что перечислено в схеме. Раньше сюда уходило тело
    // целиком, и `{ id, isPaid: true }` закрывал долг без единого сума.
    const data: Record<string, unknown> = {};
    if (fields.personName !== undefined) data.personName = fields.personName;
    if (fields.phone !== undefined) data.phone = fields.phone || null;
    if (fields.description !== undefined) data.description = fields.description || null;
    if (fields.dueDate !== undefined) {
      const due = fields.dueDate ? new Date(fields.dueDate) : null;
      if (due && Number.isNaN(due.getTime())) {
        return NextResponse.json({ error: 'Некорректный срок' }, { status: 400 });
      }
      data.dueDate = due;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Нечего менять' }, { status: 400 });
    }

    const updated = await prisma.debt.update({ where: { id }, data });
    return NextResponse.json({ success: true, debt: updated });
  } catch (error) {
    console.error('Debt update error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

/**
 * DELETE — закрыть долг.
 *
 * Комментарий здесь обещал мягкое закрытие («soft: mark as paid»), а код
 * делал `prisma.debt.delete` — физическое удаление финансовой записи.
 * Долг — это история расчётов: кто сколько был должен и когда рассчитался.
 * Стирать её нельзя, поэтому теперь код делает то, что и было обещано.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Debt ID majburiy' }, { status: 400 });
    }

    const debt = await prisma.debt.findUnique({ where: { id } });
    if (!debt) {
      return NextResponse.json({ error: 'Qarz topilmadi' }, { status: 404 });
    }

    const closed = await prisma.debt.update({
      where: { id },
      data: { isPaid: true, paidAmount: debt.amount },
    });
    return NextResponse.json({ success: true, debt: closed });
  } catch (error) {
    console.error('Debt close error:', error);
    return NextResponse.json({ error: 'Xatolik yuz berdi' }, { status: 500 });
  }
}

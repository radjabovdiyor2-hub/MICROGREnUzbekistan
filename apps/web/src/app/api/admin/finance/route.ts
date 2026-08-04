import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { isAuthorized, unauthorized } from '@/lib/adminAuth';
import { audit } from '@/lib/audit';
import { categoriesFor, isKnownCategory } from '@/lib/finance/categories';

// ══════════════════════════════════════════════════════════════════════
// Доходы, расходы и P&L.
//
// Таблица finances существовала и наполнялась ботами, но в вебе не было
// ни одного экрана: всю финансовую картину владелец видел только через
// Telegram-бота Finance.
//
// ⚠️ Отчёты считаем по колонке `date` (деловая дата), а НЕ по created_at
// (момент внесения строки). Расход, внесённый задним числом, при расчёте
// по created_at выпадал из месячного P&L и завышал прибыль — на этом уже
// обжигались, поэтому здесь то же правило, что у analytics и stepan.
// ══════════════════════════════════════════════════════════════════════

const ALLOWED_TYPE = new Set(['income', 'expense']);

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const sp = new URL(request.url).searchParams;
  const days = Math.min(Math.max(Number(sp.get('days')) || 30, 1), 365);
  const type = sp.get('type');

  const from = new Date();
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);

  const where = {
    date: { gte: from },
    ...(type && ALLOWED_TYPE.has(type) ? { type } : {}),
  };

  const [rows, grouped] = await Promise.all([
    prisma.finance.findMany({ where, orderBy: [{ date: 'desc' }, { id: 'desc' }], take: 300 }),
    prisma.finance.groupBy({
      by: ['type', 'category'],
      where: { date: { gte: from } },
      _sum: { amount: true },
    }),
  ]);

  let income = 0;
  let expense = 0;
  const byCategory: Record<string, { type: string; category: string; total: number }> = {};

  for (const g of grouped) {
    const total = Number(g._sum.amount ?? 0);
    if (g.type === 'income') income += total;
    else if (g.type === 'expense') expense += total;
    byCategory[`${g.type}:${g.category}`] = { type: g.type, category: g.category, total };
  }

  const profit = income - expense;

  const breakdown = sp.get('breakdown');

  return NextResponse.json({
    status: 'ok',
    period: { days, from: from.toISOString().slice(0, 10) },
    summary: {
      income,
      expense,
      profit,
      margin: income > 0 ? Math.round((profit / income) * 1000) / 10 : 0,
    },
    byCategory: Object.values(byCategory).sort((a, b) => b.total - a.total),
    byProduct: breakdown === 'product' ? await getProductBreakdown(from) : undefined,
    entries: rows.map(r => ({
      id: r.id,
      type: r.type,
      amount: Number(r.amount),
      category: r.category,
      description: r.description,
      date: r.date.toISOString().slice(0, 10),
    })),
  });
}

async function getProductBreakdown(from: Date) {
  const orderItems = await prisma.orderItem.findMany({
    where: {
      order: {
        createdAt: { gte: from },
        status: { not: 'CANCELLED' }
      }
    },
    include: { product: true }
  });

  const byProduct: Record<string, { nameUz: string; nameRu: string; quantity: number; revenue: number; cogs: number; profit: number }> = {};

  for (const item of orderItems) {
    if (!item.product) continue;
    const pid = item.productId;
    if (!byProduct[pid]) {
      byProduct[pid] = {
        nameUz: item.product.nameUz,
        nameRu: item.product.nameRu,
        quantity: 0,
        revenue: 0,
        cogs: 0,
        profit: 0
      };
    }
    const rev = item.price * item.quantity;
    const cogs = (item.product.costPrice || 0) * item.quantity;
    byProduct[pid].quantity += item.quantity;
    byProduct[pid].revenue += rev;
    byProduct[pid].cogs += cogs;
    byProduct[pid].profit += (rev - cogs);
  }

  return Object.values(byProduct).sort((a, b) => b.profit - a.profit);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
  }

  const type = String(body.type ?? '');
  if (!ALLOWED_TYPE.has(type)) {
    return NextResponse.json({ error: 'type: income или expense' }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Сумма должна быть больше нуля' }, { status: 400 });
  }

  const category = String(body.category ?? '').trim().slice(0, 50);
  if (!category) {
    return NextResponse.json({ error: 'Укажите статью' }, { status: 400 });
  }
  // Статья должна быть из общего списка. Выпадающего списка в форме мало:
  // в ту же таблицу пишет Telegram-бот финансов, и рукописная «аренда»
  // рядом с ботовым `rent` навсегда раздваивала строку в отчёте.
  if (!isKnownCategory(type, category)) {
    return NextResponse.json({
      error:
        `Неизвестная статья «${category}». Допустимые: ` +
        categoriesFor(type).map((c) => `${c.label} (${c.value})`).join(', '),
    }, { status: 400 });
  }

  // Деловую дату можно проставить задним числом — это и есть смысл колонки.
  let date = new Date();
  if (body.date) {
    date = new Date(String(body.date));
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: 'Некорректная дата' }, { status: 400 });
    }
  }

  const created = await prisma.finance.create({
    data: {
      type,
      amount,
      category,
      description: body.description ? String(body.description).slice(0, 2000) : null,
      date,
    },
  });

  audit({
    action: `finance.${type}`,
    actor: 'owner',
    role: 'ADMIN',
    ip: request.headers.get('x-forwarded-for') ?? undefined,
    target: `#${created.id}`,
    meta: { amount, category, date: date.toISOString().slice(0, 10) },
  });

  return NextResponse.json({ status: 'ok', entry: { ...created, amount: Number(created.amount) } });
}

export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();

  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Нужен числовой id' }, { status: 400 });
  }

  try {
    const removed = await prisma.finance.delete({ where: { id } });
    audit({
      action: 'finance.delete', actor: 'owner', role: 'ADMIN',
      ip: request.headers.get('x-forwarded-for') ?? undefined,
      target: `#${id}`, meta: { amount: Number(removed.amount), category: removed.category },
    });
    return NextResponse.json({ status: 'ok' });
  } catch {
    return NextResponse.json({ error: 'Запись не найдена' }, { status: 404 });
  }
}

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════════════
// Разовый заполнитель шапок чека `pos_sales` для УЖЕ записанных продаж.
//
// ЗАЧЕМ
//
// До появления таблицы чек существовал только как набор `stock_movements`,
// связанных номером ВНУТРИ строки `reason` («Do'kon sotish (S-…)»). Отчёт
// смены и возврат вытаскивали номер регулярками. Новый код пишет шапку и
// ссылку `sale_id`, а старые движения остались без неё: без этого скрипта
// прошлые чеки перестали бы группироваться в отчёте, а возврат по ним
// нашёлся бы только запасным путём по тексту.
//
// ЧТО ВОССТАНАВЛИВАЕТСЯ, А ЧТО НЕТ
//
// Номер, дата, автор, способ оплаты и суммы — из самих движений. Скидка на
// чек, покупатель и причина проводки задним числом в старых данных не
// хранились нигде: у восстановленных шапок они пустые, и это честно —
// придумывать их значило бы задним числом сочинить историю уступок.
//
// Идемпотентен: движения с уже проставленным `sale_id` не трогает,
// существующие номера пропускает. Повторный запуск ничего не меняет.
//
//   npx tsx prisma/backfill-pos-sales.ts
// ══════════════════════════════════════════════════════════════════════

/** Номер чека внутри причины: «Do'kon sotish (S-…)», «Qaytarish (R-…) ← S-…». */
function numberFrom(reason: string | null, prefix: 'S' | 'R'): string | null {
  const match = reason?.match(new RegExp(`\\(${prefix}-[A-Z0-9-]+\\)`));
  return match ? match[0].replace(/[()]/g, '') : null;
}

interface Group {
  number: string;
  kind: 'sale' | 'refund';
  ids: string[];
  soldAt: Date;
  performedBy: string;
  paymentMethod: string;
  total: number;
  reason: string | null;
}

async function collect(): Promise<Group[]> {
  // Только движения кассы и только без шапки. Онлайн-заказы (`orderId`) сюда
  // не относятся: их чек — это строка `orders`.
  const movements = await prisma.stockMovement.findMany({
    where: { saleId: null, orderId: null, salePrice: { not: null } },
    select: {
      id: true, type: true, quantity: true, salePrice: true,
      reason: true, performedBy: true, soldAt: true,
    },
    orderBy: { soldAt: 'asc' },
  });

  const groups = new Map<string, Group>();
  for (const m of movements) {
    const kind = m.type === 'IN' ? 'refund' : 'sale';
    const number = numberFrom(m.reason, kind === 'refund' ? 'R' : 'S');
    // Без номера чек не восстановить: это ручное списание или запись,
    // сделанная в обход кассы. Оставляем как есть, не выдумывая группу.
    if (!number) continue;

    const line = Math.round(Math.abs(Number(m.quantity)) * (m.salePrice ?? 0));
    const existing = groups.get(number);
    if (existing) {
      existing.ids.push(m.id);
      existing.total += line;
      continue;
    }
    groups.set(number, {
      number,
      kind,
      ids: [m.id],
      soldAt: m.soldAt,
      performedBy: m.performedBy || 'Egasi',
      // «Qarzga sotish» — продажа в долг; остальное считаем наличными.
      paymentMethod: m.reason?.startsWith('Qarzga') ? 'debt' : 'cash',
      total: line,
      reason: kind === 'refund' ? m.reason : null,
    });
  }
  return [...groups.values()];
}

async function main() {
  const groups = await collect();
  if (groups.length === 0) {
    console.log('pos_sales: восстанавливать нечего.');
    return;
  }

  console.log(`pos_sales: восстанавливаю ${groups.length} чеков…`);
  let created = 0;
  let linked = 0;

  for (const group of groups) {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.posSale.findUnique({ where: { number: group.number } });
      const sale = existing ?? await tx.posSale.create({
        data: {
          number: group.number,
          kind: group.kind,
          soldAt: group.soldAt,
          performedBy: group.performedBy.slice(0, 100),
          paymentMethod: group.paymentMethod,
          // Скидки в старых данных не было — ставим ноль, а не догадку.
          gross: group.total,
          discount: 0,
          total: group.total,
          reason: group.reason,
        },
      });
      if (!existing) created += 1;

      const updated = await tx.stockMovement.updateMany({
        where: { id: { in: group.ids }, saleId: null },
        data: { saleId: sale.id },
      });
      linked += updated.count;
    });
  }

  // Возврат ссылается на исходную продажу. Делаем вторым проходом: чек
  // продажи мог быть создан позже возврата в порядке обхода.
  let matched = 0;
  const refunds = await prisma.posSale.findMany({
    where: { kind: 'refund', refundOfId: null },
    select: { id: true, reason: true },
  });
  for (const refund of refunds) {
    const originalNumber = refund.reason?.match(/S-[A-Z0-9-]+/)?.[0];
    if (!originalNumber) continue;
    const original = await prisma.posSale.findUnique({
      where: { number: originalNumber },
      select: { id: true },
    });
    if (!original) continue;
    await prisma.posSale.update({
      where: { id: refund.id },
      data: { refundOfId: original.id },
    });
    matched += 1;
  }

  console.log(`pos_sales: создано шапок ${created}, привязано движений ${linked}, возвратов сшито ${matched}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

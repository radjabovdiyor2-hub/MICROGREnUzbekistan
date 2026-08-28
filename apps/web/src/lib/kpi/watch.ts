import { prisma } from '@repo/database';
import { loadMargin } from '@/lib/finance/margin';
import { byBusinessDate } from '@/lib/revenue/salesLedger';
import { getNumber } from '@/lib/settings/store';
import { collectBreaches, defectShare, largestClientShare, type Breach } from './thresholds';

// ══════════════════════════════════════════════════════════════════════
// Суточная проверка коридоров нормы.
//
// Одно оповещение на все нарушения сразу, а не по одному на показатель:
// показатели портятся вместе — плохая неделя роняет и брак, и число
// активных точек, — и три отдельных сигнала об одной причине превращают
// колокольчик в шум. Образец гашения повторов взят у `orders/crmAlert.ts`.
// ══════════════════════════════════════════════════════════════════════

const QUIET_MS = 20 * 60 * 60 * 1000;
const KIND = 'kpi_breach';

/** За какой период смотрим. Месяц — достаточно, чтобы не дёргаться на неделе. */
const WINDOW_DAYS = 30;

export async function collectKpiBreaches(today = new Date()): Promise<Breach[]> {
  const from = new Date(today);
  from.setDate(from.getDate() - WINDOW_DAYS);
  from.setHours(0, 0, 0, 0);

  const [margin, movements, defectLimitPct, concentrationLimitPct, minCustomers] = await Promise.all([
    loadMargin(from, today),
    // Списание — это уход со склада без продажи: ни заказа, ни цены.
    // Определение то же, что в salesLedger, где такие движения намеренно
    // не считаются выручкой.
    prisma.stockMovement.findMany({
      where: { type: 'OUT', ...byBusinessDate({ gte: from, lte: today }) },
      select: { quantity: true, salePrice: true, orderId: true },
    }),
    getNumber('kpi.defectSharePct'),
    getNumber('kpi.maxClientSharePct'),
    getNumber('kpi.minActiveCustomers'),
  ]);

  let writtenOff = 0;
  let sold = 0;
  for (const m of movements) {
    const qty = Math.abs(Number(m.quantity));
    if (m.salePrice === null && m.orderId === null) writtenOff += qty;
    else sold += qty;
  }

  // Активным считается заведение, что-то купившее за окно. Розница сюда не
  // входит: у неё нет карточки, и «потерять» её как клиента нельзя.
  const activeCustomers = margin.byCustomer.filter((r) => r.key !== 'unknown' && r.revenue > 0).length;

  return collectBreaches({
    defect: defectShare(writtenOff, sold),
    defectLimit: defectLimitPct / 100,
    concentration: largestClientShare(margin.byCustomer),
    concentrationLimit: concentrationLimitPct / 100,
    activeCustomers,
    minCustomers,
  });
}

/**
 * Поднять тревогу о вышедших за коридор показателях.
 *
 * Никогда не бросает исключение: её зовут из суточного отчёта, и уронить
 * его из-за неудачной записи оповещения было бы хуже самой тишины.
 */
export async function alertKpiBreaches(today = new Date()): Promise<void> {
  try {
    const breaches = await collectKpiBreaches(today);
    if (breaches.length === 0) return;

    const since = new Date(today.getTime() - QUIET_MS);
    const already = await prisma.ownerAlert.findFirst({
      where: { kind: KIND, createdAt: { gte: since } },
      select: { id: true },
    });
    if (already) return;

    await prisma.ownerAlert.create({
      data: {
        kind: KIND,
        severity: breaches.length > 1 ? 'critical' : 'warning',
        title:
          breaches.length === 1
            ? breaches[0].title
            : `Показатели вышли за норму: ${breaches.length}`,
        message: breaches.map((b) => `${b.title}. ${b.detail}`).join('\n\n'),
        source: 'web',
      },
    });
  } catch (err) {
    console.error('[kpi] не удалось записать оповещение о показателях:', err);
  }
}

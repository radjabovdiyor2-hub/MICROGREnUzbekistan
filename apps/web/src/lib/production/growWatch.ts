import { prisma } from '@repo/database';

// ══════════════════════════════════════════════════════════════════════
// Что созрело, что вот-вот пропадёт — на стороне сервера.
//
// Фазу партии умел считать только экран «Посадки» в браузере, поэтому узнать
// о готовой партии можно было, лишь открыв вкладку. При сроке хранения 5–7
// дней партия успевала протухнуть молча — а убыток теперь считается по
// настоящей себестоимости и виден в деньгах.
//
// Тот же расчёт, что в apps/tgas/shared/grow_watch.py: бот и админка не
// должны по-разному оценивать одну и ту же партию.
// ══════════════════════════════════════════════════════════════════════

/** За сколько дней до конца хранения партия считается «горит». */
export const URGENT_DAYS_LEFT = 1;

export interface WatchedBatch {
  id: string;
  crop: string;
  trays: number;
  cost: number;
  daysLeft: number;
  productName: string | null;
}

export interface GrowState {
  ready: WatchedBatch[];
  urgent: WatchedBatch[];
  expired: WatchedBatch[];
  tomorrow: WatchedBatch[];
}

/**
 * Сколько ЦЕЛЫХ суток прошло с посева. Сравниваем календарные дни, а не
 * моменты: партия, посеянная вчера вечером, сегодня утром прожила один день,
 * а не ноль.
 *
 * Экспортируется, потому что этой же меркой считает досрочное открытие
 * партии (`setDarkPhase` в growBatch.ts). Своей копии календаря там быть не
 * должно: фаза выводится из дат, и разойдись эти две функции на день —
 * открытая партия осталась бы «в темноте» на экране.
 */
export function daysSince(seedDate: Date, now: Date): number {
  const a = Date.UTC(seedDate.getFullYear(), seedDate.getMonth(), seedDate.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((b - a) / 86_400_000);
}

/** Разложить незакрытые партии по состояниям. */
export async function scanGrowBatches(now: Date = new Date()): Promise<GrowState> {
  const batches = await prisma.growBatch.findMany({
    where: { status: { not: 'harvested' } },
    orderBy: { seedDate: 'asc' },
  });

  // Русские названия культур — из справочника норм, чтобы в сообщении не
  // мелькали слаги вроде `amaranth`.
  const norms = await prisma.cropNorm.findMany({ select: { cropType: true, nameRu: true } });
  const nameOf = new Map(norms.map((n) => [n.cropType, n.nameRu]));

  const state: GrowState = { ready: [], urgent: [], expired: [], tomorrow: [] };

  for (const b of batches) {
    const elapsed = daysSince(b.seedDate, now);
    const lightEnd = b.darkDays + b.lightDays;
    const shelfEnd = lightEnd + b.shelfDays;

    const item: WatchedBatch = {
      id: b.id,
      crop: nameOf.get(b.cropType) ?? b.cropType,
      trays: b.trays,
      cost: Number(b.seedCost ?? 0) + Number(b.suppliesCost ?? 0),
      daysLeft: shelfEnd - elapsed,
      productName: b.productName,
    };

    if (elapsed >= shelfEnd) state.expired.push(item);
    else if (elapsed >= lightEnd) {
      state.ready.push(item);
      if (item.daysLeft <= URGENT_DAYS_LEFT) state.urgent.push(item);
    } else if (elapsed === lightEnd - 1) state.tomorrow.push(item);
  }

  return state;
}

/**
 * Записать сигнал владельцу, если есть о чём.
 *
 * Идемпотентно в пределах суток: сигнал одного вида создаётся один раз в
 * день. Иначе ежечасный крон засыпал бы колокольчик одинаковыми строками, и
 * владелец перестал бы их читать — а вместе с ними и настоящие тревоги.
 */
export async function raiseGrowAlerts(state: GrowState, now: Date = new Date()): Promise<number> {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  const planned: { kind: string; severity: string; title: string; message: string }[] = [];

  if (state.urgent.length > 0) {
    planned.push({
      kind: 'grow_urgent',
      severity: 'critical',
      title: `Продать сегодня: ${state.urgent.length} партий`,
      message: state.urgent
        .map((b) => `${b.crop}, ${b.trays} лотк. — завтра списывать`)
        .join('; '),
    });
  }

  if (state.expired.length > 0) {
    const loss = state.expired.reduce((s, b) => s + b.cost, 0);
    planned.push({
      kind: 'grow_expired',
      severity: 'warning',
      title: `Просрочено партий: ${state.expired.length}`,
      message:
        state.expired.map((b) => `${b.crop}, ${b.trays} лотк.`).join('; ') +
        (loss > 0 ? ` · убыток ${Math.round(loss).toLocaleString('ru-RU')} сум` : ''),
    });
  }

  if (state.ready.length > 0 && state.urgent.length === 0) {
    planned.push({
      kind: 'grow_ready',
      severity: 'info',
      title: `Готово к продаже: ${state.ready.length} партий`,
      message: state.ready
        .map((b) => `${b.crop}, ${b.trays} лотк. (осталось ${b.daysLeft} дн.)`)
        .join('; '),
    });
  }

  let created = 0;
  for (const alert of planned) {
    const already = await prisma.ownerAlert.findFirst({
      where: { kind: alert.kind, createdAt: { gte: dayStart } },
      select: { id: true },
    });
    if (already) continue;

    await prisma.ownerAlert.create({
      data: { ...alert, source: 'web_cron' },
    });
    created++;
  }
  return created;
}

/** Блок про посадки для ежедневного отчёта в Telegram. */
export function growReportLines(state: GrowState): string {
  const parts: string[] = [];

  if (state.ready.length > 0) {
    parts.push(`🌱 <b>Sotishga tayyor (${state.ready.length}):</b>`);
    for (const b of state.ready) {
      parts.push(`   ${b.crop}, ${b.trays} lotok — ${b.daysLeft} kun qoldi`);
    }
  }
  if (state.expired.length > 0) {
    const loss = state.expired.reduce((s, b) => s + b.cost, 0);
    parts.push(`❌ <b>Muddati o'tgan (${state.expired.length}):</b>`);
    parts.push(`   Zarar: ${Math.round(loss).toLocaleString('ru-RU')} so'm`);
  }

  return parts.length ? parts.join('\n') + '\n\n' : '';
}
